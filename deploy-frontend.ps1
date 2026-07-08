param(
    [Parameter(Mandatory = $true)]
    [string]$BucketName,

    [Parameter(Mandatory = $true)]
    [string]$CloudFrontDistributionId,

    [Parameter(Mandatory = $false)]
    [string]$Prefix = "pet-recipe-app"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $repoRoot "frontend"

if (-not (Test-Path $frontendDir)) {
    throw "Could not find frontend folder at $frontendDir"
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI not found. Install and configure AWS CLI first."
}

$cleanPrefix = $Prefix.Trim("/")
$target = if ([string]::IsNullOrWhiteSpace($cleanPrefix)) {
    "s3://$BucketName"
} else {
    "s3://$BucketName/$cleanPrefix"
}

Write-Host "Syncing static assets to $target ..." -ForegroundColor Cyan
aws s3 sync "$frontendDir" "$target" --delete --exclude "*.html" --cache-control "public,max-age=31536000,immutable"

Write-Host "Uploading HTML with no-cache headers ..." -ForegroundColor Cyan
Get-ChildItem -Path $frontendDir -Filter "*.html" -File | ForEach-Object {
    $source = $_.FullName
    $key = if ([string]::IsNullOrWhiteSpace($cleanPrefix)) {
        $_.Name
    } else {
        "$cleanPrefix/$($_.Name)"
    }

    aws s3 cp "$source" "s3://$BucketName/$key" --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html; charset=utf-8"
}

if ([string]::IsNullOrWhiteSpace($cleanPrefix)) {
    $invalidatePath = "/*"
} else {
    $invalidatePath = "/$cleanPrefix/*"
}

Write-Host "Creating CloudFront invalidation for $invalidatePath ..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id "$CloudFrontDistributionId" --paths "$invalidatePath"

Write-Host "Done. Deployment complete." -ForegroundColor Green
