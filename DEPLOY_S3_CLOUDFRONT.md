# Deploy Frontend To S3 + CloudFront

This app can be deployed as static files from the `frontend` folder.

## Prerequisites

- AWS CLI installed and authenticated for the target AWS account
- S3 bucket used by your existing `app.joesparkman.com` CloudFront setup
- CloudFront distribution ID for that domain
- Cognito app client callback and sign-out URLs include your deployed URL path

## One-time AWS Setup

1. Ensure your CloudFront behavior routes your app path to the S3 origin.
2. If deploying under a subpath (example: `/pet-recipe-app/`), make sure this URL is allowed in Cognito:
   - `https://app.joesparkman.com/pet-recipe-app/index.html`
3. Keep local callback URL too if you still test on localhost.

## Create Bucket From Terminal

Use the included script to create a bucket safely with secure defaults:

```powershell
.\create-s3-bucket.ps1 -BucketName YOUR_BUCKET -Region us-east-1
```

Optional: enable versioning while creating/configuring bucket:

```powershell
.\create-s3-bucket.ps1 -BucketName YOUR_BUCKET -Region us-east-1 -EnableVersioning
```

The script will:
- Create bucket if it does not exist
- Keep going if it already exists
- Enable block public access
- Enable default encryption (SSE-S3)
- Optionally enable versioning

## Deploy Command

From this project folder, run:

```powershell
.\deploy-frontend.ps1 -BucketName YOUR_BUCKET -CloudFrontDistributionId YOUR_DIST_ID -Prefix pet-recipe-app
```

Notes:
- `-Prefix pet-recipe-app` publishes to `s3://YOUR_BUCKET/pet-recipe-app/`
- Use empty prefix to publish to bucket root:

```powershell
.\deploy-frontend.ps1 -BucketName YOUR_BUCKET -CloudFrontDistributionId YOUR_DIST_ID -Prefix ""
```

## Verify

1. Open your deployed URL:
   - `https://app.joesparkman.com/pet-recipe-app/index.html`
2. Click Sign In and confirm return to the same deployed URL.
3. Generate recipe, save recipe, save pet profile, then refresh lists.

## Rollback

Re-run the same deploy command from a previous known-good frontend snapshot.
