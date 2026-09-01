<#
.SYNOPSIS
    Setup GCP Infrastructure for Solana Transactions - Solana Transactions (GKE Autopilot)
#>

[CmdletBinding()]
param(
    [string]$ProjectId = "aiservice-solana-transactions",
    [string]$Region = "us-central1",
    [string]$ClusterName = "autopilot-cluster",
    [string]$GarRepo = "solana-transactions",
    [string]$SaName = "github-actions-gke",
    [string]$GitHubRepo = "hanimounla/solana_transactions"
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Setting up GCP Resources for project: $ProjectId" -ForegroundColor Cyan
Write-Host "   Region:       $Region"
Write-Host "   GKE Cluster:  $ClusterName (Autopilot)"
Write-Host "   Artifact Reg: $GarRepo"
Write-Host "   GitHub Repo:  $GitHubRepo"
Write-Host "======================================================================" -ForegroundColor Cyan

# Check if gcloud CLI is installed
if (-not (Get-Command "gcloud" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'gcloud' CLI is not found in your PATH." -ForegroundColor Red
    Write-Host "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    Write-Host "OR run this script directly in Google Cloud Shell (https://shell.cloud.google.com)." -ForegroundColor Yellow
    exit 1
}

# 1. Set Active Project
gcloud config set project $ProjectId

# 2. Enable Required APIs
Write-Host "Enabling GCP APIs..." -ForegroundColor Yellow
gcloud services enable container.googleapis.com artifactregistry.googleapis.com iam.googleapis.com iamcredentials.googleapis.com cloudresourcemanager.googleapis.com compute.googleapis.com

# 3. Create Artifact Registry Repository
Write-Host "Checking Artifact Registry repository: $GarRepo..." -ForegroundColor Yellow
cmd.exe /c "gcloud artifacts repositories describe $GarRepo --location=$Region >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating Artifact Registry repository: $GarRepo..." -ForegroundColor Yellow
    gcloud artifacts repositories create $GarRepo --repository-format=docker --location=$Region --description="Docker repository for Solana Transactions"
    Write-Host "Artifact Registry repository created." -ForegroundColor Green
} else {
    Write-Host "Artifact Registry repository already exists." -ForegroundColor Gray
}

# 4. Create GKE Autopilot Cluster
Write-Host "Checking GKE Autopilot Cluster: $ClusterName..." -ForegroundColor Yellow
cmd.exe /c "gcloud container clusters describe $ClusterName --region=$Region >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating GKE Autopilot Cluster: $ClusterName..." -ForegroundColor Yellow
    gcloud container clusters create-auto $ClusterName --region=$Region --project=$ProjectId --release-channel="regular"
    Write-Host "GKE Autopilot Cluster created." -ForegroundColor Green
} else {
    Write-Host "GKE Cluster already exists." -ForegroundColor Gray
}

# 5. Configure Service Account
$saEmail = "$SaName@$ProjectId.iam.gserviceaccount.com"
Write-Host "Checking Service Account: $saEmail..." -ForegroundColor Yellow
cmd.exe /c "gcloud iam service-accounts describe $saEmail >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating Service Account: $saEmail..." -ForegroundColor Yellow
    gcloud iam service-accounts create $SaName --display-name="GitHub Actions GKE Deployer"
    Write-Host "Service Account created." -ForegroundColor Green
}

gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$saEmail" --role="roles/container.developer" --quiet
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$saEmail" --role="roles/artifactregistry.writer" --quiet

# 6. Configure Workload Identity Federation
Write-Host "Configuring Workload Identity Federation for GitHub Actions..." -ForegroundColor Yellow
$poolName = "github-pool"
$providerName = "github-provider"
$projectNumber = ((gcloud projects describe $ProjectId --format="value(projectNumber)") -join "").Trim()

cmd.exe /c "gcloud iam workload-identity-pools describe $poolName --location=global >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    gcloud iam workload-identity-pools create $poolName --location="global" --display-name="GitHub Actions Pool"
}

cmd.exe /c "gcloud iam workload-identity-pools providers describe $providerName --workload-identity-pool=$poolName --location=global --project=$ProjectId >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating Workload Identity Provider: $providerName..." -ForegroundColor Yellow
    gcloud iam workload-identity-pools providers create-oidc $providerName `
        --project=$ProjectId `
        --location="global" `
        --workload-identity-pool=$poolName `
        --display-name="GitHub Provider" `
        --issuer-uri="https://token.actions.githubusercontent.com" `
        --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" `
        --attribute-condition="assertion.repository == '$GitHubRepo'"
}

$wifPrincipal = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/global/workloadIdentityPools/$poolName/attribute.repository/$GitHubRepo"

Write-Host "Binding Workload Identity User and Token Creator roles..." -ForegroundColor Yellow
gcloud iam service-accounts add-iam-policy-binding $saEmail --project=$ProjectId --role="roles/iam.workloadIdentityUser" --member="$wifPrincipal" --quiet
gcloud iam service-accounts add-iam-policy-binding $saEmail --project=$ProjectId --role="roles/iam.serviceAccountTokenCreator" --member="$wifPrincipal" --quiet
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$saEmail" --role="roles/iam.serviceAccountTokenCreator" --quiet

$wifProviderResource = "projects/$projectNumber/locations/global/workloadIdentityPools/$poolName/providers/$providerName"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "Setup Complete! Add the following secrets to GitHub Repository:" -ForegroundColor Green
Write-Host "   URL: https://github.com/$GitHubRepo/settings/secrets/actions" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Option A: Workload Identity Federation (Recommended)" -ForegroundColor Cyan
Write-Host "   Secret Name: GCP_WORKLOAD_IDENTITY_PROVIDER"
Write-Host "   Value:       $wifProviderResource"
Write-Host ""
Write-Host "   Secret Name: GCP_SERVICE_ACCOUNT"
Write-Host "   Value:       $saEmail"
Write-Host ""
Write-Host "Repository Variables (https://github.com/$GitHubRepo/settings/variables/actions):" -ForegroundColor Cyan
Write-Host "   GCP_PROJECT_ID: $ProjectId"
Write-Host "   GCP_REGION:     $Region"
Write-Host "   GKE_CLUSTER:    $ClusterName"
Write-Host "   GAR_REPOSITORY: $GarRepo"
Write-Host ""
