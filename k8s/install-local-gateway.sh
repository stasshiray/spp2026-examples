#!/usr/bin/env bash
set -euo pipefail

# One-time Docker Desktop Kubernetes setup.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
manifests="$k8s_dir/manifests"

ENVOY_GATEWAY_VERSION="${ENVOY_GATEWAY_VERSION:-v1.9.1}"
export GATEWAY_CLASS=eg

if ! command -v kubectl >/dev/null; then
  echo "kubectl is required" >&2
  exit 1
fi

if ! command -v envsubst >/dev/null; then
  echo "envsubst is required (macOS: brew install gettext)" >&2
  exit 1
fi

echo "Installing Envoy Gateway ${ENVOY_GATEWAY_VERSION}..."
kubectl apply --server-side -f "https://github.com/envoyproxy/gateway/releases/download/${ENVOY_GATEWAY_VERSION}/install.yaml"
kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available

kubectl apply -f "$manifests/cluster/gatewayclass-eg.yaml"
envsubst '${GATEWAY_CLASS}' < "$manifests/cluster/gateway.yaml" | kubectl apply -f -
kubectl apply -f "$manifests/cluster/envoyproxy-desktop.yaml"
kubectl -n gateway patch gateway main-envoy-gateway --type merge --patch '{
  "spec": {
    "infrastructure": {
      "parametersRef": {
        "group": "gateway.envoyproxy.io",
        "kind": "EnvoyProxy",
        "name": "lecture"
      }
    }
  }
}'

echo "Waiting for Gateway to be programmed..."
kubectl -n gateway wait --for=condition=Programmed gateway/main-envoy-gateway --timeout=3m
kubectl -n gateway get gateway main-envoy-gateway

echo "Local Gateway is ready. Deploy an environment with k8s/deploy-local-kubernetes.sh"
