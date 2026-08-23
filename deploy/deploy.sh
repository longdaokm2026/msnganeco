#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: deploy.sh <image-tag> <web-image> <api-image>" >&2
  exit 64
fi

release_tag="$1"
export WEB_IMAGE="$2"
export API_IMAGE="$3"

app_dir="${APP_DIR:-/opt/msngan}"
env_file="$app_dir/.env.production"
compose_file="$app_dir/compose.prod.yaml"
release_file="$app_dir/.release"

if [[ ! -f "$env_file" ]]; then
  echo "Missing production environment: $env_file" >&2
  exit 66
fi

if [[ ! -f "$compose_file" || ! -f "$app_dir/Caddyfile" ]]; then
  echo "Missing production Compose or Caddy configuration in $app_dir" >&2
  exit 66
fi

previous_tag=""
if [[ -f "$release_file" ]]; then
  previous_tag="$(tr -d '[:space:]' < "$release_file")"
fi

compose=(docker compose --project-directory "$app_dir" --env-file "$env_file" -f "$compose_file")

health_check() {
  local attempt
  for attempt in {1..12}; do
    if "${compose[@]}" exec -T api node -e \
      "fetch('http://127.0.0.1:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      && "${compose[@]}" exec -T web node -e \
      "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

export IMAGE_TAG="$release_tag"
"${compose[@]}" pull web api caddy postgres

echo "Starting PostgreSQL..."
"${compose[@]}" up -d postgres

echo "Waiting for PostgreSQL..."

for attempt in {1..30}; do
    if "${compose[@]}" exec -T postgres sh -c \
       'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
       >/dev/null 2>&1; then
        echo "PostgreSQL is ready."
        break
    fi

    if [[ "$attempt" -eq 30 ]]; then
        echo "PostgreSQL failed to become ready." >&2
        "${compose[@]}" logs postgres
        exit 1
    fi

    sleep 2
done

echo "Running Prisma migrations..."

"${compose[@]}" run --rm --no-deps api \
    ./node_modules/.bin/prisma migrate deploy

echo "Starting production stack..."

"${compose[@]}" up -d --remove-orphans

# Run schema changes once, before new application containers receive traffic.
#"${compose[@]}" run --rm --no-deps api ./node_modules/.bin/prisma migrate deploy
#"${compose[@]}" up -d --remove-orphans

if ! health_check; then
  echo "Release $release_tag failed health checks." >&2
  if [[ -n "$previous_tag" && "$previous_tag" != "$release_tag" ]]; then
    echo "Restoring application containers from $previous_tag." >&2
    export IMAGE_TAG="$previous_tag"
    "${compose[@]}" up -d --remove-orphans
  fi
  exit 1
fi

printf '%s\n' "$release_tag" > "$release_file"
"${compose[@]}" ps
echo "Release $release_tag is healthy."
