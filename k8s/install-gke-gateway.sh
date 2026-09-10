#!/usr/bin/env bash
set -euo pipefail

# One-time GKE Gateway setup. Do not run against Docker Desktop.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

gke_load_env
gke_require_cmds gcloud kubectl envsubst
gke_require_vars GCP_PROJECT_ID GKE_CLUSTER GKE_LOCATION
gke_credentials

export GATEWAY_CLASS
echo "Applying Gateway (class ${GATEWAY_CLASS})..."
envsubst '${GATEWAY_CLASS}' < "$manifests/cluster/gateway.yaml" | kubectl apply -f -

echo "Waiting for Gateway to be programmed (often 2–5 minutes)..."
kubectl -n gateway wait --for=condition=Programmed gateway/main-envoy-gateway --timeout=10m
kubectl -n gateway get gateway main-envoy-gateway

ip="$(kubectl -n gateway get gateway main-envoy-gateway -o jsonpath='{.status.addresses[0].value}' 2>/dev/null || true)"
if [ -n "$ip" ]; then
  echo "Gateway IP: $ip"
  echo "Set INGRESS_DOMAIN in k8s/gke.env, for example: ${ip}.sslip.io"
fi

echo "GKE Gateway is ready. Deploy an environment with k8s/deploy-gke-kubernetes.sh"
