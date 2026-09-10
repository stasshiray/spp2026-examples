#!/usr/bin/env bash
set -euo pipefail

k8s_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$k8s_dir/.." && pwd)"
cd "$repo_root"

ns="$(git rev-parse --abbrev-ref HEAD | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//')"

if [ -z "$ns" ]; then
  echo "Could not derive a Kubernetes namespace from the current branch" >&2
  exit 1
fi

case "$ns" in
  default | gateway | envoy-gateway-system)
    echo "Refusing to delete protected namespace: $ns" >&2
    exit 1
    ;;
esac
if [[ "$ns" == kube-* || "$ns" == gke-* ]]; then
  echo "Refusing to delete protected namespace: $ns" >&2
  exit 1
fi

echo "Deleting namespace $ns"
kubectl delete namespace "$ns" --wait=true --timeout=5m
