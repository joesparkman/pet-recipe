import json
import os
import time
import uuid
from urllib import error, request

import boto3
from boto3.dynamodb.conditions import Key


MODEL_NAME = "gemini-2.5-flash-lite"
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    f"models/{MODEL_NAME}:generateContent"
)
GEMINI_SECRET_NAME = os.environ.get("GEMINI_SECRET_NAME", "")
SAVED_RECIPES_TABLE = os.environ.get("SAVED_RECIPES_TABLE", "SavedRecipes")
PET_PROFILES_TABLE = os.environ.get("PET_PROFILES_TABLE", "PetProfiles")

dynamodb = boto3.resource("dynamodb")


def get_api_key():
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        return api_key

    if not GEMINI_SECRET_NAME:
        raise RuntimeError("Set GEMINI_API_KEY or GEMINI_SECRET_NAME before running this script.")

    try:
        secret_client = boto3.client("secretsmanager")
        secret_value = secret_client.get_secret_value(SecretId=GEMINI_SECRET_NAME)
    except Exception as exc:
        raise RuntimeError(f"Could not load Gemini key from Secrets Manager: {exc}") from exc

    secret_string = secret_value.get("SecretString", "")
    if not secret_string:
        raise RuntimeError("Secrets Manager secret is empty.")

    try:
        parsed_secret = json.loads(secret_string)
        if isinstance(parsed_secret, dict):
            api_key = (
                parsed_secret.get("GEMINI_API_KEY")
                or parsed_secret.get("api_key")
                or parsed_secret.get("key")
            )
        else:
            api_key = ""
    except json.JSONDecodeError:
        api_key = secret_string.strip()

    if not api_key:
        raise RuntimeError("Gemini API key not found in Secrets Manager secret.")

    return api_key


def build_prompt(ingredients, pet_type, allergies):
    return (
        f"Create a simple pet-safe recipe for a {pet_type} using {ingredients}. "
        f"Avoid {allergies}. Include a short safety note if any ingredient needs caution."
    )


def generate_recipe(ingredients, pet_type, allergies):
    prompt_text = build_prompt(ingredients, pet_type, allergies)
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt_text}],
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 500,
        },
    }

    http_request = request.Request(
        f"{GEMINI_API_URL}?key={get_api_key()}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=30) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        error_body = exc.read().decode("utf-8") if exc.fp else str(exc)
        raise RuntimeError(f"Gemini API request failed: {error_body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Gemini API network error: {exc.reason}") from exc

    try:
        parts = response_body["candidates"][0]["content"]["parts"]
        texts = [part.get("text", "") for part in parts if isinstance(part, dict)]
        full_text = "\n".join([text.strip() for text in texts if text and text.strip()]).strip()
        if not full_text:
            raise KeyError("No text content in Gemini response parts")
        return full_text
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected Gemini response format: {response_body}") from exc


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def get_claims(event):
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    jwt_claims = authorizer.get("jwt", {}).get("claims")
    if isinstance(jwt_claims, dict):
        return jwt_claims

    claims = authorizer.get("claims")
    if isinstance(claims, dict):
        return claims

    return {}


def get_user_id_from_event(event):
    claims = get_claims(event)
    return claims.get("sub") or claims.get("username") or claims.get("cognito:username")


def save_recipe_for_user(user_id, payload):
    table = dynamodb.Table(SAVED_RECIPES_TABLE)
    recipe_id = str(uuid.uuid4())
    now_ms = int(time.time() * 1000)

    item = {
        "user_id": user_id,
        "recipe_id": recipe_id,
        "created_at": now_ms,
        "pet_type": payload.get("pet_type", ""),
        "ingredients": payload.get("ingredients", ""),
        "allergies": payload.get("allergies", "none"),
        "recipe": payload.get("recipe", ""),
    }

    table.put_item(Item=item)
    return item


def list_recipes_for_user(user_id):
    table = dynamodb.Table(SAVED_RECIPES_TABLE)
    db_response = table.query(
        KeyConditionExpression=Key("user_id").eq(user_id)
    )

    items = db_response.get("Items", [])
    items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return items


def save_pet_profile_for_user(user_id, payload):
    table = dynamodb.Table(PET_PROFILES_TABLE)
    pet_id = str(uuid.uuid4())
    now_ms = int(time.time() * 1000)

    item = {
        "user_id": user_id,
        "pet_id": pet_id,
        "created_at": now_ms,
        "pet_name": payload.get("pet_name", ""),
        "pet_type": payload.get("pet_type", ""),
        "allergies": payload.get("allergies", "none"),
        "notes": payload.get("notes", ""),
    }

    table.put_item(Item=item)
    return item


def list_pet_profiles_for_user(user_id):
    table = dynamodb.Table(PET_PROFILES_TABLE)
    db_response = table.query(KeyConditionExpression=Key("user_id").eq(user_id))

    items = db_response.get("Items", [])
    items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return items


def parse_body(event):
    body = event.get("body") if isinstance(event, dict) else None
    if isinstance(body, str):
        return json.loads(body or "{}")
    if isinstance(body, dict):
        return body
    if isinstance(event, dict):
        return event
    return {}


def handle_generate_recipe(payload):
    ingredients = payload.get("ingredients", "")
    pet_type = payload.get("pet_type", "")
    allergies = payload.get("allergies", "none")

    if not ingredients or not pet_type:
        return response(400, {"error": "ingredients and pet_type are required"})

    try:
        recipe = generate_recipe(ingredients, pet_type, allergies)
    except Exception as exc:
        return response(500, {"error": str(exc)})

    return response(200, {"recipe": recipe, "model": MODEL_NAME})


def handle_save_recipe(event):
    user_id = get_user_id_from_event(event)
    if not user_id:
        return response(401, {"error": "Unauthorized"})

    payload = parse_body(event)
    if not payload.get("recipe"):
        return response(400, {"error": "recipe is required"})

    try:
        item = save_recipe_for_user(user_id, payload)
    except Exception as exc:
        return response(500, {"error": f"Could not save recipe: {exc}"})

    return response(200, {"message": "Recipe saved", "item": item})


def handle_list_saved_recipes(event):
    user_id = get_user_id_from_event(event)
    if not user_id:
        return response(401, {"error": "Unauthorized"})

    try:
        items = list_recipes_for_user(user_id)
    except Exception as exc:
        return response(500, {"error": f"Could not list saved recipes: {exc}"})

    return response(200, {"items": items})


def handle_save_pet_profile(event):
    user_id = get_user_id_from_event(event)
    if not user_id:
        return response(401, {"error": "Unauthorized"})

    payload = parse_body(event)
    if not payload.get("pet_type"):
        return response(400, {"error": "pet_type is required"})

    try:
        item = save_pet_profile_for_user(user_id, payload)
    except Exception as exc:
        return response(500, {"error": f"Could not save pet profile: {exc}"})

    return response(200, {"message": "Pet profile saved", "item": item})


def handle_list_pet_profiles(event):
    user_id = get_user_id_from_event(event)
    if not user_id:
        return response(401, {"error": "Unauthorized"})

    try:
        items = list_pet_profiles_for_user(user_id)
    except Exception as exc:
        return response(500, {"error": f"Could not list pet profiles: {exc}"})

    return response(200, {"items": items})


def lambda_handler(event, context):
    if not isinstance(event, dict):
        return response(400, {"error": "Invalid event payload"})

    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or ""
    ).upper()
    path = event.get("rawPath") or event.get("path") or ""

    if method == "OPTIONS":
        return response(204, {})

    if method == "POST" and path.endswith("/saved-recipes"):
        return handle_save_recipe(event)

    if method == "GET" and path.endswith("/saved-recipes"):
        return handle_list_saved_recipes(event)

    if method == "POST" and path.endswith("/pet-profiles"):
        return handle_save_pet_profile(event)

    if method == "GET" and path.endswith("/pet-profiles"):
        return handle_list_pet_profiles(event)

    payload = parse_body(event)
    return handle_generate_recipe(payload)


def main():
    ingredients = input("Enter ingredients: ")
    pet_type = input("Enter pet type: ")
    allergies = input("Enter allergies: ")

    recipe = generate_recipe(ingredients, pet_type, allergies)

    print("\n--- Generated Recipe ---")
    print(recipe)


if __name__ == "__main__":
    main()