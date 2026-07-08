const form = document.getElementById("recipe-form");
const statusPill = document.getElementById("status-pill");
const recipeOutput = document.getElementById("recipe-output");
const rawResponse = document.getElementById("raw-response");
const submitButton = form.querySelector("button[type='submit']");
const authState = document.getElementById("auth-state");
const signInBtn = document.getElementById("sign-in-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const saveRecipeBtn = document.getElementById("save-recipe-btn");
const refreshSavedBtn = document.getElementById("refresh-saved-btn");
const savedRecipesList = document.getElementById("saved-recipes-list");
const savePetBtn = document.getElementById("save-pet-btn");
const refreshPetsBtn = document.getElementById("refresh-pets-btn");
const savedPetsList = document.getElementById("saved-pets-list");

const API_URL = "https://dfad1s1tml.execute-api.us-east-1.amazonaws.com/recipes";
const API_BASE_URL = API_URL.replace(/\/recipes\/?$/, "");
const SAVED_RECIPES_URL = `${API_BASE_URL}/saved-recipes`;
const PET_PROFILES_URL = `${API_BASE_URL}/pet-profiles`;
const TOKEN_STORAGE_KEY = "petRecipeAuthTokens";
let lastGeneratedRecipe = null;

function resolveRedirectUri() {
    const path = window.location.pathname || "/";
    const basePath = path.endsWith("/") ? path : path.replace(/[^/]*$/, "");
    return `${window.location.origin}${basePath}index.html`;
}

// Fill these with your Cognito values from App client settings.
const COGNITO = {
    domain: "https://us-east-1hmwutf810.auth.us-east-1.amazoncognito.com",
    clientId: "6uuigv8asqnkp9ljgbh66r02jl",
    redirectUri: resolveRedirectUri(),
    scopes: ["openid", "email", "profile"],
};

function getStoredTokens() {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function storeTokens(tokens) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

function clearTokens() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

function parseJwtPayload(token) {
    if (!token || typeof token !== "string") {
        return null;
    }

    const parts = token.split(".");
    if (parts.length < 2) {
        return null;
    }

    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const json = atob(padded);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function isCognitoConfigured() {
    return COGNITO.domain.includes("auth.") && COGNITO.domain.includes("amazoncognito.com");
}

function updateAuthUi() {
    const tokens = getStoredTokens();
    const signedIn = Boolean(tokens && tokens.access_token);

    if (!isCognitoConfigured()) {
        authState.textContent = "Sign in not configured yet";
        signInBtn.disabled = true;
        signOutBtn.disabled = true;
        return;
    }

    if (signedIn) {
        const idClaims = parseJwtPayload(tokens.id_token);
        const email = idClaims?.email;
        authState.textContent = email
            ? `Signed in as ${email}`
            : "Signed in: saved data available";
    } else {
        authState.textContent = "Guest mode: recipes only";
    }

    signInBtn.disabled = signedIn;
    signOutBtn.disabled = !signedIn;
    saveRecipeBtn.disabled = !signedIn;
    refreshSavedBtn.disabled = !signedIn;
    savePetBtn.disabled = !signedIn;
    refreshPetsBtn.disabled = !signedIn;
}

function renderSavedRecipes(items) {
    savedRecipesList.innerHTML = "";

    if (!items || !items.length) {
        const p = document.createElement("p");
        p.className = "saved-empty";
        p.textContent = "No saved recipes yet.";
        savedRecipesList.appendChild(p);
        return;
    }

    items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "saved-item";

        const title = document.createElement("p");
        title.className = "saved-item-header";
        title.textContent = `${item.pet_type || "Pet"} recipe`;

        const meta = document.createElement("p");
        meta.className = "saved-item-meta";
        const created = item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown time";
        meta.textContent = `Saved ${created} | Allergies: ${item.allergies || "none"}`;

        const text = document.createElement("p");
        text.className = "saved-item-text";
        text.textContent = item.recipe || "No recipe text found.";

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(text);
        savedRecipesList.appendChild(card);
    });
}

function renderSignedOutSavedState() {
    savedRecipesList.innerHTML = "";
    const p = document.createElement("p");
    p.className = "saved-empty";
    p.textContent = "Sign in to view saved recipes.";
    savedRecipesList.appendChild(p);
}

function renderPets(items) {
    savedPetsList.innerHTML = "";

    if (!items || !items.length) {
        const p = document.createElement("p");
        p.className = "saved-empty";
        p.textContent = "No pet profiles saved yet.";
        savedPetsList.appendChild(p);
        return;
    }

    items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "saved-item";

        const title = document.createElement("p");
        title.className = "saved-item-header";
        title.textContent = item.pet_name
            ? `${item.pet_name} (${item.pet_type || "pet"})`
            : `${item.pet_type || "Pet"} profile`;

        const meta = document.createElement("p");
        meta.className = "saved-item-meta";
        const created = item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown time";
        meta.textContent = `Saved ${created} | Allergies: ${item.allergies || "none"}`;

        const text = document.createElement("p");
        text.className = "saved-item-text";
        text.textContent = item.notes || "No notes for this pet profile.";

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(text);
        savedPetsList.appendChild(card);
    });
}

function renderSignedOutPetsState() {
    savedPetsList.innerHTML = "";
    const p = document.createElement("p");
    p.className = "saved-empty";
    p.textContent = "Sign in to manage pet profiles.";
    savedPetsList.appendChild(p);
}

async function loadSavedRecipes() {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
        renderSignedOutSavedState();
        return;
    }

    const response = await fetch(SAVED_RECIPES_URL, {
        method: "GET",
        headers: {
            Authorization: authHeader,
        },
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || "Could not load saved recipes.");
    }

    renderSavedRecipes(payload.items || []);
}

async function saveCurrentRecipe() {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
        throw new Error("Please sign in before saving recipes.");
    }

    if (!lastGeneratedRecipe || !lastGeneratedRecipe.recipe) {
        throw new Error("Generate a recipe first, then save it.");
    }

    const response = await fetch(SAVED_RECIPES_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
        },
        body: JSON.stringify(lastGeneratedRecipe),
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || "Could not save recipe.");
    }
}

async function loadPets() {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
        renderSignedOutPetsState();
        return;
    }

    const response = await fetch(PET_PROFILES_URL, {
        method: "GET",
        headers: {
            Authorization: authHeader,
        },
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || "Could not load pet profiles.");
    }

    renderPets(payload.items || []);
}

async function saveCurrentPetProfile() {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
        throw new Error("Please sign in before saving pet profiles.");
    }

    const pet_name = document.getElementById("pet-name").value.trim();
    const pet_type = document.getElementById("pet-type").value.trim();
    const allergies = document.getElementById("allergies").value.trim() || "none";
    if (!pet_type) {
        throw new Error("Enter a pet type first.");
    }

    const payload = {
        pet_type,
        allergies,
        pet_name,
        notes: `Preferred ingredients: ${document.getElementById("ingredients").value.trim() || "none"}`,
    };

    const response = await fetch(PET_PROFILES_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Could not save pet profile.");
    }
}

function toBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length = 64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

async function createCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toBase64Url(digest);
}

async function startSignIn() {
    const verifier = randomString(96);
    const state = randomString(32);
    const challenge = await createCodeChallenge(verifier);

    sessionStorage.setItem("pkce_verifier", verifier);
    sessionStorage.setItem("pkce_state", state);

    const authUrl = new URL(`${COGNITO.domain}/oauth2/authorize`);
    authUrl.searchParams.set("client_id", COGNITO.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", COGNITO.scopes.join(" "));
    authUrl.searchParams.set("redirect_uri", COGNITO.redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", challenge);

    window.location.href = authUrl.toString();
}

async function exchangeCodeForTokens(code) {
    const verifier = sessionStorage.getItem("pkce_verifier");
    if (!verifier) {
        throw new Error("Missing PKCE verifier. Try signing in again.");
    }

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: COGNITO.clientId,
        code,
        redirect_uri: COGNITO.redirectUri,
        code_verifier: verifier,
    });

    const response = await fetch(`${COGNITO.domain}/oauth2/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error_description || "Could not complete sign in.");
    }

    storeTokens(payload);
    sessionStorage.removeItem("pkce_verifier");
    sessionStorage.removeItem("pkce_state");
}

async function handleAuthRedirect() {
    if (!isCognitoConfigured()) {
        return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = sessionStorage.getItem("pkce_state");

    if (!code) {
        return;
    }

    if (!state || state !== expectedState) {
        throw new Error("Sign-in state mismatch. Please try again.");
    }

    await exchangeCodeForTokens(code);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
}

function getAuthorizationHeader() {
    const tokens = getStoredTokens();
    if (!tokens || !tokens.access_token) {
        return null;
    }

    return `Bearer ${tokens.access_token}`;
}

function signOut() {
    clearTokens();
    updateAuthUi();

    if (!isCognitoConfigured()) {
        return;
    }

    const logoutUrl = new URL(`${COGNITO.domain}/logout`);
    logoutUrl.searchParams.set("client_id", COGNITO.clientId);
    logoutUrl.searchParams.set("logout_uri", COGNITO.redirectUri);
    window.location.href = logoutUrl.toString();
}

function setStatus(state, text) {
    statusPill.className = `status-pill ${state}`;
    statusPill.textContent = text;
}

signInBtn.addEventListener("click", async () => {
    try {
        await startSignIn();
    } catch (error) {
        setStatus("error", "Sign-in failed");
        recipeOutput.textContent = error.message || "Could not start sign in.";
    }
});

signOutBtn.addEventListener("click", () => {
    signOut();
    renderSignedOutSavedState();
    renderSignedOutPetsState();
});

saveRecipeBtn.addEventListener("click", async () => {
    try {
        await saveCurrentRecipe();
        setStatus("success", "Recipe saved");
        await loadSavedRecipes();
    } catch (error) {
        setStatus("error", "Save failed");
        recipeOutput.textContent = error.message || "Could not save recipe.";
    }
});

refreshSavedBtn.addEventListener("click", async () => {
    try {
        await loadSavedRecipes();
    } catch (error) {
        setStatus("error", "Load failed");
        recipeOutput.textContent = error.message || "Could not load saved recipes.";
    }
});

savePetBtn.addEventListener("click", async () => {
    try {
        await saveCurrentPetProfile();
        setStatus("success", "Pet profile saved");
        await loadPets();
    } catch (error) {
        setStatus("error", "Save failed");
        recipeOutput.textContent = error.message || "Could not save pet profile.";
    }
});

refreshPetsBtn.addEventListener("click", async () => {
    try {
        await loadPets();
    } catch (error) {
        setStatus("error", "Load failed");
        recipeOutput.textContent = error.message || "Could not load pet profiles.";
    }
});

(async () => {
    try {
        await handleAuthRedirect();
    } catch (error) {
        setStatus("error", "Sign-in failed");
        recipeOutput.textContent = error.message || "Could not complete sign in.";
    } finally {
        updateAuthUi();
        if (getAuthorizationHeader()) {
            try {
                await loadSavedRecipes();
            } catch {
                renderSavedRecipes([]);
            }
            try {
                await loadPets();
            } catch {
                renderPets([]);
            }
        } else {
            renderSignedOutSavedState();
            renderSignedOutPetsState();
        }
    }
})();

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const petName = document.getElementById("pet-name").value.trim();
    const payload = {
        pet_name: petName,
        pet_type: document.getElementById("pet-type").value.trim(),
        ingredients: document.getElementById("ingredients").value.trim(),
        allergies: document.getElementById("allergies").value.trim() || "none",
    };

    setStatus("loading", "Creating recipe...");
    submitButton.disabled = true;
    recipeOutput.textContent = "Working on your pet recipe...";
    rawResponse.textContent = "Sending your request...";

    try {
        const headers = {
            "Content-Type": "application/json",
        };

        const authHeader = getAuthorizationHeader();
        if (authHeader) {
            headers.Authorization = authHeader;
        }

        const response = await fetch(API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        rawResponse.textContent = responseText;

        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch {
            throw new Error("Something went wrong reading the response. Please try again.");
        }

        if (!response.ok) {
            throw new Error(parsed.error || "We could not generate a recipe right now. Please try again.");
        }

        lastGeneratedRecipe = {
            pet_name: payload.pet_name,
            pet_type: payload.pet_type,
            ingredients: payload.ingredients,
            allergies: payload.allergies,
            recipe: parsed.recipe || "",
        };
        recipeOutput.textContent = parsed.recipe || "No recipe was returned. Please try again.";
        setStatus("success", "Recipe is ready");
    } catch (error) {
        recipeOutput.textContent = error.message || "Something went wrong. Please try again.";
        setStatus("error", "Could not generate recipe");
    } finally {
        submitButton.disabled = false;
    }
});