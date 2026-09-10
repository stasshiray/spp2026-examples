#!/usr/bin/env bash
set -euo pipefail

# One-time Artifact Registry repo + IAM for GKE node pulls and local docker push.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

gke_load_env
gke_require_cmds gcloud
gke_require_vars GCP_PROJECT_ID GCP_REGION
AR_REPOSITORY="${AR_REPOSITORY:-repository-1}"

echo "Enabling Artifact Registry API..."
gcloud services enable artifactregistry.googleapis.com --project="$GCP_PROJECT_ID"

if gcloud artifacts repositories describe "$AR_REPOSITORY" \
  --location="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Repository ${AR_REPOSITORY} already exists in ${GCP_REGION}."
else
  echo "Creating Docker repository ${AR_REPOSITORY} in ${GCP_REGION}..."
  gcloud artifacts repositories create "$AR_REPOSITORY" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID"
fi

project_number="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
node_sa="${project_number}-compute@developer.gserviceaccount.com"
echo "Granting roles/artifactregistry.reader to ${node_sa}..."
gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --location="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:${node_sa}" \
  --role=roles/artifactregistry.reader

gke_robot="service-${project_number}@container-engine-robot.iam.gserviceaccount.com"
echo "Granting roles/artifactregistry.reader to ${gke_robot}..."
gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --location="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:${gke_robot}" \
  --role=roles/artifactregistry.reader

account="$(gcloud config get-value account 2>/dev/null)"
if [ -n "$account" ] && [ "$account" != "(unset)" ]; then
  if [[ "$account" == *.iam.gserviceaccount.com ]]; then
    pusher="serviceAccount:${account}"
  else
    pusher="user:${account}"
  fi
  echo "Granting roles/artifactregistry.writer to ${pusher}..."
  gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" \
    --member="$pusher" \
    --role=roles/artifactregistry.writer
fi

echo "Artifact Registry is ready: ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}"
echo "Set AR_REPOSITORY=${AR_REPOSITORY} in k8s/gke.env if it is not already."
