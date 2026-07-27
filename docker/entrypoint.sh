#!/bin/sh

set -eu

CONFIG_DIR="${APP_CONFIG_DIR:-/app/data/config}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/data/uploads}"

umask 077
mkdir -p "$CONFIG_DIR" "$UPLOADS_DIR"

load_or_create_secret() {
  variable_name="$1"
  filename="$2"
  minimum_length="$3"
  current_value="$(printenv "$variable_name" 2>/dev/null || true)"
  secret_path="$CONFIG_DIR/$filename"

  if [ -n "$current_value" ]; then
    if [ "${#current_value}" -lt "$minimum_length" ]; then
      echo "Erreur : $variable_name doit contenir au moins $minimum_length caractères." >&2
      exit 1
    fi
  elif [ -s "$secret_path" ]; then
    current_value="$(sed -n '1p' "$secret_path")"
  else
    current_value="$(node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))")"
    temporary_path="$secret_path.tmp.$$"
    printf '%s\n' "$current_value" > "$temporary_path"
    chmod 600 "$temporary_path"
    mv "$temporary_path" "$secret_path"
    echo "Secret $variable_name généré et conservé dans le volume de configuration."
  fi

  if [ "${#current_value}" -lt "$minimum_length" ]; then
    echo "Erreur : le secret persistant $variable_name est trop court." >&2
    exit 1
  fi

  export "$variable_name=$current_value"
}

# Ces secrets doivent rester stables : sessions, OAuth et clés Resend chiffrées
# deviendraient invalides après une rotation involontaire.
load_or_create_secret AUTH_SECRET auth-secret 32
load_or_create_secret OAUTH_SECRET oauth-secret 32
load_or_create_secret SETTINGS_ENCRYPTION_KEY settings-encryption-key 32
load_or_create_secret CRON_SECRET cron-secret 32

if [ -z "${DATABASE_URL:-}" ] && [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  export DATABASE_URL="$(
    node -e '
      const env = process.env;
      const user = encodeURIComponent(env.POSTGRES_USER || "apel");
      const password = encodeURIComponent(env.POSTGRES_PASSWORD || "apel-local-only");
      const host = env.POSTGRES_HOST || "db";
      const port = env.POSTGRES_PORT || "5432";
      const database = encodeURIComponent(env.POSTGRES_DB || "apel_manager");
      process.stdout.write(`postgresql://${user}:${password}@${host}:${port}/${database}`);
    '
  )"
fi

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  attempt=1
  maximum_attempts="${MIGRATION_MAX_ATTEMPTS:-30}"

  while ! node scripts/migrate.mjs; do
    if [ "$attempt" -ge "$maximum_attempts" ]; then
      echo "Échec des migrations après $attempt tentatives." >&2
      exit 1
    fi

    delay=$((attempt < 10 ? attempt : 10))
    echo "PostgreSQL indisponible, nouvelle tentative dans ${delay}s ($attempt/$maximum_attempts)." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
fi

exec "$@"
