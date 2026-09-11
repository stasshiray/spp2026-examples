#!/usr/bin/env bash
set -euo pipefail

k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

cd "$repo_root"

gke_load_env
gke_require_cmds gcloud kubectl docker envsubst openssl
gke_require_vars GCP_PROJECT_ID GKE_CLUSTER GKE_LOCATION GCP_REGION AR_REPOSITORY INGRESS_DOMAIN
gke_credentials

if ! kubectl -n gateway get gateway main-envoy-gateway >/dev/null 2>&1; then
  echo "GKE Gateway is not installed. Run k8s/install-gke-gateway.sh once first." >&2
  exit 1
fi

export NAMESPACE
NAMESPACE="$(gke_namespace)"
if [ -z "$NAMESPACE" ]; then
  echo "Could not derive a Kubernetes namespace from the current branch" >&2
  exit 1
fi

sha="$(git rev-parse --short HEAD)"
registry="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}"
export API_IMAGE="${registry}/api:${sha}"
export WEB_IMAGE="${registry}/web:${sha}"
export INGRESS_HOST="${NAMESPACE}.${INGRESS_DOMAIN}"
if [ "$INGRESS_DOMAIN" = "sslip.io" ] || [ "$INGRESS_DOMAIN" = "nip.io" ]; then
  echo "INGRESS_DOMAIN must include the Gateway IP, e.g. 8.232.28.79.sslip.io (not sslip.io)." >&2
  exit 1
fi

echo "Building and pushing ${API_IMAGE} and ${WEB_IMAGE} (linux/amd64 for GKE)..."
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
docker build --platform linux/amd64 -f ./apps/api/Dockerfile -t "$API_IMAGE" .
docker build --platform linux/amd64 -f ./apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL= -t "$WEB_IMAGE" .
docker push "$API_IMAGE"
docker push "$WEB_IMAGE"

ensure_postgres_port

gke_apply_manifest "$manifests"/namespace.yaml
ensure_dating_app_db_secret "$NAMESPACE"

for manifest in "$manifests"/postgres.yaml "$manifests"/api.yaml "$manifests"/web.yaml "$manifests"/httproute.yaml; do
  gke_apply_manifest "$manifest"
done

kubectl -n "$NAMESPACE" rollout status deployment/postgres --timeout=5m
kubectl -n "$NAMESPACE" rollout status deployment/api --timeout=5m
kubectl -n "$NAMESPACE" rollout status deployment/web --timeout=5m

echo "URL: http://${INGRESS_HOST}"
