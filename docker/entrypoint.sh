#!/bin/sh

set -eu

CONFIG_DIR="${APP_CONFIG_DIR:-/app/data/config}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/data/uploads}"

umask 077
mkdir -p "$CONFIG_DIR" "$UPLOADS_DIR"

random_secret() {
  node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
}

# Fichier temporaire propre à l'appel. Le PID ne suffirait pas : les conteneurs
# qui partagent ce volume démarrent tous leur entrypoint en PID 1 et
# écriraient donc dans le même fichier.
write_temp_file() {
  temporary_path="$(mktemp "$1.tmp.XXXXXXXX")"
  printf '%s\n' "$2" > "$temporary_path"
  chmod 600 "$temporary_path"
  printf '%s' "$temporary_path"
}

# Écrit le secret uniquement s'il n'existe pas encore, puis renvoie la valeur
# finalement conservée. `ln` échoue quand la cible existe déjà : deux
# conteneurs lancés en même temps sur un volume vierge retiennent donc le même
# secret au lieu d'en générer chacun un.
create_secret_file() {
  secret_path="$1"
  proposed_value="$2"
  temporary_path="$(write_temp_file "$secret_path" "$proposed_value")"

  if ln "$temporary_path" "$secret_path" 2>/dev/null; then
    rm -f "$temporary_path"
    printf '%s' "$proposed_value"
  else
    rm -f "$temporary_path"
    sed -n '1p' "$secret_path"
  fi
}

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
    if [ -s "$secret_path" ]; then
      persisted_value="$(sed -n '1p' "$secret_path")"
    else
      persisted_value="$(create_secret_file "$secret_path" "$current_value")"
      echo "Secret $variable_name fourni et conservé dans le volume de configuration."
    fi
    if [ "$persisted_value" != "$current_value" ]; then
      echo "Erreur : $variable_name diffère du secret conservé dans $secret_path." >&2
      echo "Conservez la valeur existante ou effectuez une rotation contrôlée avant de redémarrer." >&2
      exit 1
    fi
  elif [ -s "$secret_path" ]; then
    current_value="$(sed -n '1p' "$secret_path")"
  else
    current_value="$(create_secret_file "$secret_path" "$(random_secret)")"
    echo "Secret $variable_name généré et conservé dans le volume de configuration."
  fi

  if [ "${#current_value}" -lt "$minimum_length" ]; then
    echo "Erreur : le secret persistant $variable_name est trop court." >&2
    exit 1
  fi

  export "$variable_name=$current_value"
}

# Ces secrets doivent rester stables : sessions, OAuth et identifiants chiffrés
# deviendraient invalides après une rotation involontaire.
load_or_create_secret AUTH_SECRET auth-secret 32
load_or_create_secret OAUTH_SECRET oauth-secret 32
load_or_create_secret SETTINGS_ENCRYPTION_KEY settings-encryption-key 32
load_or_create_secret CRON_SECRET cron-secret 32

# Jeton autorisant l'application à demander un redémarrage immédiat au
# conteneur `updater`, sur la même machine. Le conteneur `updater` lit ce même
# fichier : personne n'a donc de valeur à choisir ni à recopier. Contrairement
# aux secrets ci-dessus, le remplacer n'invalide rien — une valeur imposée dans
# le `.env` prend simplement la place de celle qui a été générée.
updater_token_path="$CONFIG_DIR/updater-token"
if [ -n "${WATCHTOWER_HTTP_API_TOKEN:-}" ]; then
  if [ "$(sed -n '1p' "$updater_token_path" 2>/dev/null || true)" != "$WATCHTOWER_HTTP_API_TOKEN" ]; then
    mv "$(write_temp_file "$updater_token_path" "$WATCHTOWER_HTTP_API_TOKEN")" \
      "$updater_token_path"
  fi
elif [ -s "$updater_token_path" ]; then
  export WATCHTOWER_HTTP_API_TOKEN="$(sed -n '1p' "$updater_token_path")"
else
  export WATCHTOWER_HTTP_API_TOKEN="$(create_secret_file "$updater_token_path" "$(random_secret)")"
  echo "Jeton de déclenchement de l'updater généré et conservé dans le volume de configuration."
fi

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
