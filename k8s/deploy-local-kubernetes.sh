#!/usr/bin/env bash
set -euo pipefail

k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

cd "$repo_root"

if ! kubectl get gatewayclass eg >/dev/null 2>&1; then
  echo "Local Gateway is not installed. Run k8s/install-local-gateway.sh once first." >&2
  exit 1
fi

docker build -f ./apps/api/Dockerfile -t dating-app-api:dev .
docker build -f ./apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL= -t dating-app-web:dev .

export NAMESPACE
NAMESPACE="$(gke_namespace)"
if [ -z "$NAMESPACE" ]; then
  echo "Could not derive a Kubernetes namespace from the current branch" >&2
  exit 1
fi
export API_IMAGE=dating-app-api:dev
export WEB_IMAGE=dating-app-web:dev
export INGRESS_HOST="${NAMESPACE}.localhost"
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
