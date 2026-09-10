#!/usr/bin/env bash
set -euo pipefail

# One-time service account + Workload Identity Federation for GitHub Actions.
# JSON keys are not created (often blocked by iam.disableServiceAccountKeyCreation).
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

gke_load_env
gke_require_cmds gcloud git
gke_require_vars GCP_PROJECT_ID GCP_REGION
AR_REPOSITORY="${AR_REPOSITORY:-repository-1}"
SA_NAME="${GITHUB_SA_NAME:-github-actions}"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="${GITHUB_WIF_POOL:-github}"
PROVIDER_ID="${GITHUB_WIF_PROVIDER:-github}"

github_repo="${GITHUB_REPOSITORY:-}"
if [ -z "$github_repo" ]; then
  origin="$(git -C "$repo_root" remote get-url origin 2>/dev/null || true)"
  origin="${origin%.git}"
  origin="${origin#git@github.com:}"
  origin="${origin#https://github.com/}"
  origin="${origin#http://github.com/}"
  origin="${origin#ssh://git@github.com/}"
  github_repo="$origin"
fi
if [[ ! "$github_repo" =~ ^[^/]+/[^/]+$ ]]; then
  echo "Could not derive owner/repo. Set GITHUB_REPOSITORY=owner/repo" >&2
  exit 1
fi

if ! gcloud artifacts repositories describe "$AR_REPOSITORY" \
  --location="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Artifact Registry ${AR_REPOSITORY} not found. Run k8s/create-gke-artifact-registry.sh first." >&2
  exit 1
fi

echo "Enabling IAM APIs..."
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project="$GCP_PROJECT_ID"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Service account ${SA_EMAIL} already exists."
else
  echo "Creating service account ${SA_EMAIL}..."
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$GCP_PROJECT_ID" \
    --display-name="GitHub Actions GKE deploy"
fi

echo "Waiting for ${SA_EMAIL} to propagate..."
ready=0
for _ in $(seq 1 30); do
  if gcloud iam service-accounts describe "$SA_EMAIL" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Service account ${SA_EMAIL} did not become ready" >&2
  exit 1
fi
sleep 8

bind_until_ok() {
  local n=0
  local max=12
  until "$@"; do
    n=$((n + 1))
    if [ "$n" -ge "$max" ]; then
      return 1
    fi
    echo "IAM not ready yet, retrying in 5s (${n}/${max})..."
    sleep 5
  done
}

echo "Granting roles/container.developer to ${SA_EMAIL}..."
bind_until_ok gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/container.developer" \
  --condition=None \
  --quiet

echo "Granting roles/artifactregistry.writer on ${AR_REPOSITORY}..."
bind_until_ok gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --location="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer" \
  --quiet

if gcloud iam workload-identity-pools describe "$POOL_ID" \
  --location=global \
  --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Workload Identity pool ${POOL_ID} already exists."
else
  echo "Creating Workload Identity pool ${POOL_ID}..."
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$GCP_PROJECT_ID" \
    --location=global \
    --display-name="GitHub Actions"
fi

mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner"
condition="assertion.repository=='${github_repo}'"

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Updating OIDC provider ${PROVIDER_ID} for ${github_repo}..."
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$GCP_PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --attribute-mapping="$mapping" \
    --attribute-condition="$condition"
else
  echo "Creating OIDC provider ${PROVIDER_ID} for ${github_repo}..."
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$GCP_PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$mapping" \
    --attribute-condition="$condition"
fi

project_number="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
wif_member="principalSet://iam.googleapis.com/projects/${project_number}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${github_repo}"

echo "Allowing GitHub repo ${github_repo} to impersonate ${SA_EMAIL}..."
bind_until_ok gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$GCP_PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$wif_member" \
  --condition=None \
  --quiet

provider_resource="projects/${project_number}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo
echo "Add GitHub Actions variables (Settings → Secrets and variables → Actions → Variables):"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER=${provider_resource}"
echo "  GCP_SERVICE_ACCOUNT=${SA_EMAIL}"
echo "JSON keys are not used (blocked on this project). Do not set GCP_SA_KEY."
