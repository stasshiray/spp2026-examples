# Shared helpers for GKE scripts. Source from the same directory.
k8s_gke_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifests="$k8s_gke_dir/manifests"
repo_root="$(cd "$k8s_gke_dir/.." && pwd)"

gke_load_env() {
  if [ -f "$k8s_gke_dir/gke.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$k8s_gke_dir/gke.env"
    set +a
  fi
  GATEWAY_CLASS="${GATEWAY_CLASS:-gke-l7-global-external-managed}"
  AR_REPOSITORY="${AR_REPOSITORY:-repository-1}"
}

gke_require_cmds() {
  local cmd
  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null; then
      echo "$cmd is required" >&2
      exit 1
    fi
  done
}

gke_require_vars() {
  local name missing=0
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "Missing $name. Set it in the environment or copy k8s/gke.env.example to k8s/gke.env" >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
}

gke_namespace() {
  local raw="${1:-}"
  if [ -z "$raw" ]; then
    raw="${GITHUB_REF_NAME:-}"
  fi
  if [ -z "$raw" ]; then
    raw="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
  fi
  printf '%s' "$raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g' \
    | cut -c1-63 \
    | sed -E 's/-+$//'
}

gke_credentials() {
  gcloud container clusters get-credentials "$GKE_CLUSTER" \
    --location "$GKE_LOCATION" \
    --project "$GCP_PROJECT_ID"
}

gke_protect_namespace() {
  local ns="$1"
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
}

ensure_postgres_port() {
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"
  if [[ ! "$POSTGRES_PORT" =~ ^[0-9]+$ ]] || [ "$POSTGRES_PORT" -lt 1 ] || [ "$POSTGRES_PORT" -gt 65535 ]; then
    echo "POSTGRES_PORT must be an integer 1-65535" >&2
    exit 1
  fi
  export POSTGRES_PORT
}

gke_apply_manifest() {
  envsubst '${API_IMAGE} ${WEB_IMAGE} ${INGRESS_HOST} ${NAMESPACE} ${POSTGRES_PORT}' < "$1" | kubectl apply -f -
}

# Postgres user/db match probes and the API init container. Only the password varies.
ensure_dating_app_db_secret() {
  local ns="${1:-}"
  if [ -z "$ns" ]; then
    echo "ensure_dating_app_db_secret: namespace is required" >&2
    exit 1
  fi
  if kubectl -n "$ns" get secret dating-app-db >/dev/null 2>&1; then
    echo "Secret dating-app-db already exists in $ns"
    return 0
  fi

  gke_require_cmds kubectl openssl

  local user="postgres"
  local db="dating-app-db"
  local password="${POSTGRES_PASSWORD:-}"
  if [ -z "$password" ]; then
    # Old manifests used postgres/postgres; a leftover PVC still has that password.
    if kubectl -n "$ns" get pvc postgres >/dev/null 2>&1; then
      password="postgres"
    else
      password="$(openssl rand -hex 24)"
    fi
  elif [[ ! "$password" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    echo "POSTGRES_PASSWORD must be URL-safe (letters, digits, . _ ~ -)" >&2
    exit 1
  fi

  ensure_postgres_port

  kubectl -n "$ns" create secret generic dating-app-db \
    --from-literal=POSTGRES_USER="$user" \
    --from-literal=POSTGRES_PASSWORD="$password" \
    --from-literal=POSTGRES_DB="$db" \
    --from-literal=DATABASE_URL="postgres://${user}:${password}@postgres:${POSTGRES_PORT}/${db}"
}
