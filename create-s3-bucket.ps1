param(
    [Parameter(Mandatory = $true)]
    [string]$BucketName,

    [Parameter(Mandatory = $false)]
    [string]$Region = "us-east-1",

    [Parameter(Mandatory = $false)]
    [switch]$EnableVersioning
)

$ErrorActionPreference = "Stop"

function Invoke-Aws {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & aws @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')"
    }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI not found. Install and configure AWS CLI first."
}

if ($BucketName -notmatch "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$") {
    throw "Invalid bucket name. Use lowercase letters, numbers, dots, and hyphens only."
}

Write-Host "Checking if bucket exists: $BucketName" -ForegroundColor Cyan
$bucketExists = $false
try {
    & aws s3api head-bucket --bucket "$BucketName" 2>$null | Out-Null
    $bucketExists = $true
} catch {
    $bucketExists = $false
}

if (-not $bucketExists) {
    Write-Host "Creating bucket in region $Region ..." -ForegroundColor Cyan
    if ($Region -eq "us-east-1") {
        Invoke-Aws -Arguments @("s3api", "create-bucket", "--bucket", $BucketName, "--region", $Region)
    } else {
        Invoke-Aws -Arguments @("s3api", "create-bucket", "--bucket", $BucketName, "--region", $Region, "--create-bucket-configuration", "LocationConstraint=$Region")
    }
    Write-Host "Bucket created." -ForegroundColor Green
} else {
    Write-Host "Bucket already exists or is accessible. Skipping create." -ForegroundColor Yellow
}

Write-Host "Applying secure defaults ..." -ForegroundColor Cyan
Invoke-Aws -Arguments @("s3api", "put-public-access-block", "--bucket", $BucketName, "--public-access-block-configuration", "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true")

$encryptionConfigPath = [System.IO.Path]::GetTempFileName()
try {
    $encryptionConfig = @{
        Rules = @(
            @{
                ApplyServerSideEncryptionByDefault = @{
                    SSEAlgorithm = "AES256"
                }
            }
        )
    }

    $encryptionConfigJson = $encryptionConfig | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($encryptionConfigPath, $encryptionConfigJson, $utf8NoBom)
    Invoke-Aws -Arguments @("s3api", "put-bucket-encryption", "--bucket", $BucketName, "--server-side-encryption-configuration", "file://$encryptionConfigPath")
} finally {
    Remove-Item -Path $encryptionConfigPath -ErrorAction SilentlyContinue
}

if ($EnableVersioning) {
    Write-Host "Enabling versioning ..." -ForegroundColor Cyan
    Invoke-Aws -Arguments @("s3api", "put-bucket-versioning", "--bucket", $BucketName, "--versioning-configuration", "Status=Enabled")
}

Write-Host "Done. Bucket is ready: s3://$BucketName" -ForegroundColor Green
