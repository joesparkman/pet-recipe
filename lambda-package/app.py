import json
import os

from google import genai


MODEL_NAME = "gemini-2.5-flash"


def get_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY before running this script.")

    return genai.Client(api_key=api_key)


def build_prompt(ingredients, pet_type, allergies):
    return (
        f"Create a simple pet-safe recipe for a {pet_type} using {ingredients}. "
        f"Avoid {allergies}. Include a short safety note if any ingredient needs caution."
    )


def generate_recipe(ingredients, pet_type, allergies):
    prompt_text = build_prompt(ingredients, pet_type, allergies)
    response = get_client().models.generate_content(
        model=MODEL_NAME,
        contents=prompt_text,
    )
    return response.text


def lambda_handler(event, context):
    body = event.get("body") if isinstance(event, dict) else None
    if isinstance(body, str):
        payload = json.loads(body or "{}")
    elif isinstance(body, dict):
        payload = body
    else:
        payload = event if isinstance(event, dict) else {}

    ingredients = payload.get("ingredients", "")
    pet_type = payload.get("pet_type", "")
    allergies = payload.get("allergies", "none")

    if not ingredients or not pet_type:
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "error": "ingredients and pet_type are required"
            }),
        }

    try:
        recipe = generate_recipe(ingredients, pet_type, allergies)
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": str(exc)}),
        }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({
            "recipe": recipe,
            "model": MODEL_NAME,
        }),
    }


def main():
    ingredients = input("Enter ingredients: ")
    pet_type = input("Enter pet type: ")
    allergies = input("Enter allergies: ")

    recipe = generate_recipe(ingredients, pet_type, allergies)

    print("\n--- Generated Recipe ---")
    print(recipe)


if __name__ == "__main__":
    main()