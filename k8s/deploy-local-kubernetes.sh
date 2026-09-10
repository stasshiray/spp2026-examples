#!/usr/bin/env bash
set -euo pipefail

k8s_dir="$(cd "$(dirname "$0")" && pwd)"
manifests="$k8s_dir/manifests"
repo_root="$(cd "$k8s_dir/.." && pwd)"
cd "$repo_root"

if ! kubectl get gatewayclass eg >/dev/null 2>&1; then
  echo "Local Gateway is not installed. Run k8s/install-local-gateway.sh once first." >&2
  exit 1
fi

docker build -f ./apps/api/Dockerfile -t lecture-api:dev .
docker build -f ./apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL= -t lecture-web:dev .

export NAMESPACE="$(git rev-parse --abbrev-ref HEAD | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//')"
export API_IMAGE=lecture-api:dev
export WEB_IMAGE=lecture-web:dev
export INGRESS_HOST="${NAMESPACE}.localhost"

for manifest in "$manifests"/namespace.yaml "$manifests"/postgres.yaml "$manifests"/api.yaml "$manifests"/web.yaml "$manifests"/httproute.yaml; do
  envsubst '${API_IMAGE} ${WEB_IMAGE} ${INGRESS_HOST} ${NAMESPACE}' < "$manifest" | kubectl apply -f -
done

kubectl -n "$NAMESPACE" rollout status deployment/postgres --timeout=5m
kubectl -n "$NAMESPACE" rollout status deployment/api --timeout=5m
kubectl -n "$NAMESPACE" rollout status deployment/web --timeout=5m

echo "URL: http://${INGRESS_HOST}"
