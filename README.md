# Pet Recipe App

AI-powered pet-safe recipe generator built with a static frontend and AWS serverless backend.

## Live App

- App: https://app.joesparkman.com/pet-recipe-app/index.html
- Story: https://app.joesparkman.com/pet-recipe-app/story.html
- Architecture: https://app.joesparkman.com/pet-recipe-app/architecture-diagram.html

## What It Does

- Generates pet-friendly recipes using Gemini
- Supports Cognito sign-in (PKCE flow)
- Saves and lists recipes for signed-in users
- Saves and lists pet profiles for signed-in users
- Deploys frontend on S3 + CloudFront

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Python on AWS Lambda
- API: API Gateway HTTP API
- Auth: Amazon Cognito (Hosted UI + PKCE)
- Data: DynamoDB
- AI: Google Gemini API
- Hosting: S3 + CloudFront

## Project Structure

- app.py: Lambda backend handler and route logic
- list_models.py: helper script for model listing experiments
- frontend/index.html: main UI
- frontend/styles.css: styling
- frontend/app.js: auth and API calls
- frontend/story.html: build story page
- frontend/architecture-diagram.html: architecture visual page
- create-s3-bucket.ps1: S3 bucket automation script
- deploy-frontend.ps1: static frontend deploy script
- DEPLOY_S3_CLOUDFRONT.md: deployment notes

## Backend Routes

- POST /recipes
  - Generates a recipe from pet_type, ingredients, allergies
- POST /saved-recipes (protected)
  - Saves a generated recipe for the signed-in user
- GET /saved-recipes (protected)
  - Lists saved recipes for the signed-in user
- POST /pet-profiles (protected)
  - Saves pet profile data for the signed-in user
- GET /pet-profiles (protected)
  - Lists pet profiles for the signed-in user

## Required AWS Resources

- Lambda function running app.lambda_handler
- API Gateway HTTP API with the routes above
- Cognito User Pool + App Client (Authorization Code + PKCE)
- DynamoDB table for recipes
  - Table name: SavedRecipes
  - Partition key: user_id (String)
  - Sort key: recipe_id (String)
- DynamoDB table for pets
  - Table name: PetProfiles
  - Partition key: user_id (String)
  - Sort key: pet_id (String)
- S3 bucket for static hosting (behind CloudFront)
- CloudFront distribution serving app.joesparkman.com

## Lambda Environment Variables

- GEMINI_API_KEY=your_gemini_api_key
- SAVED_RECIPES_TABLE=SavedRecipes
- PET_PROFILES_TABLE=PetProfiles

Note: If you use Secrets Manager for Gemini key retrieval, configure your Lambda code and IAM permissions accordingly.

## Local Development

1. Serve frontend files (for example with VS Code Live Server).
2. Open:
   - http://127.0.0.1:5500/frontend/index.html
3. Ensure API endpoint in frontend/app.js points to your deployed API.

## Deploy Frontend

Deploy to S3 prefix and invalidate CloudFront:

PowerShell command:
.\deploy-frontend.ps1 -BucketName app.joesparkman.com -CloudFrontDistributionId E3HHU0R4DHMA69 -Prefix pet-recipe-app

## Create S3 Bucket From Terminal

PowerShell command:
.\create-s3-bucket.ps1 -BucketName your-bucket-name -Region us-east-1

Optional with versioning:
.\create-s3-bucket.ps1 -BucketName your-bucket-name -Region us-east-1 -EnableVersioning

## Cognito Callback URLs

For production path hosting, include:

- https://app.joesparkman.com/pet-recipe-app/index.html

Keep localhost callback too if you test locally.

## Security Notes

- Do not hardcode API keys in frontend code
- Use Cognito tokens for protected API routes
- Use least-privilege IAM for Lambda
- Keep S3 bucket private and serve through CloudFront

## Repository

- https://github.com/joesparkman/pet-recipe
