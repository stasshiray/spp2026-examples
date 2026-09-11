#!/usr/bin/env bash
set -euo pipefail

# Follow logs from dating-app pods (kubectl) or GKE Cloud Logging.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

usage() {
  cat <<'EOF'
Follow logs from dating-app pods.

  ./k8s/logs.sh                 current branch namespace (kubectl)
  ./k8s/logs.sh api             only app=api in that namespace
  ./k8s/logs.sh --all           all namespaces (label app.kubernetes.io/part-of=dating-app)
  ./k8s/logs.sh --cloud         GKE Cloud Logging tail for the current namespace
  ./k8s/logs.sh --cloud --all   Cloud Logging tail for the whole GKE cluster
  ./k8s/logs.sh --since=10m     kubectl only: start from a relative time

UI (after install-local-logs.sh / install-gke-logs.sh): Dozzle in namespace logs.
EOF
}

all=0
cloud=0
app=""
since=""

while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --all)
      all=1
      ;;
    --cloud)
      cloud=1
      ;;
    --since=*)
      since="${1#--since=}"
      ;;
    --since)
      if [ $# -lt 2 ]; then
        echo "--since requires a value (for example 10m)" >&2
        exit 1
      fi
      since="$2"
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ -n "$app" ]; then
        echo "Only one app name is allowed" >&2
        exit 1
      fi
      app="$1"
      ;;
  esac
  shift
done

ns="$(gke_namespace)"
if [ -z "$ns" ]; then
  echo "Could not derive a Kubernetes namespace from the current branch" >&2
  exit 1
fi

if [ "$cloud" -eq 1 ]; then
  gke_load_env
  gke_require_cmds gcloud
  gke_require_vars GCP_PROJECT_ID
  if [ "$all" -eq 1 ]; then
    gke_require_vars GKE_CLUSTER
    filter="resource.type=\"k8s_container\" AND resource.labels.cluster_name=\"${GKE_CLUSTER}\""
  else
    filter="resource.type=\"k8s_container\" AND resource.labels.namespace_name=\"${ns}\""
  fi
  if [ -n "$app" ]; then
    filter="${filter} AND resource.labels.container_name=\"${app}\""
  fi
  query_enc="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$filter")"
  echo "Cloud Logging: ${filter}"
  echo "Console: https://console.cloud.google.com/logs/query;query=${query_enc}?project=${GCP_PROJECT_ID}"
  exec gcloud logging tail "$filter" --project="$GCP_PROJECT_ID"
fi

gke_require_cmds kubectl

selector="app.kubernetes.io/part-of=dating-app"
if [ -n "$app" ]; then
  selector="app=${app}"
fi

kubectl_args=(logs --all-containers --prefix --max-log-requests=30 -f -l "$selector")
if [ -n "$since" ]; then
  kubectl_args+=(--since="$since")
fi
if [ "$all" -eq 1 ]; then
  kubectl_args+=(-A)
else
  kubectl_args+=(-n "$ns")
fi

echo "kubectl ${kubectl_args[*]}"
exec kubectl "${kubectl_args[@]}"
