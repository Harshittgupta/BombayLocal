#!/bin/sh
# Run on the LAPTOP, from the repo root. Moves the issuer's secrets or database to/from the hosted VM without ever
# printing a secret.
#   sh issuer/deploy/push.sh <user@vm> secrets   .env -> /etc/unlink/issuer.env (only the keys the issuer needs)
#   sh issuer/deploy/push.sh <user@vm> db        issuer/issuer.db -> /var/lib/unlink/issuer.db, then starts the service
#   sh issuer/deploy/push.sh <user@vm> backup    a consistent copy of the live database -> issuer-backup-<date>.db
# Optional: SSH_KEY=~/.ssh/unlink_oci to pick the key.
set -eu
HOST="${1:?usage: push.sh <user@vm> secrets|db|backup}"
WHAT="${2:?usage: push.sh <user@vm> secrets|db|backup}"
SSH_OPTS="${SSH_KEY:+-i $SSH_KEY}"

case "$WHAT" in
  secrets)
    [ -f .env ] || { echo "run from the repo root (no .env here)" >&2; exit 1; }
    umask 077
    tmp=$(mktemp)
    grep -E '^(ISSUER_PRIVATE_KEY|ADMIN_TOKEN|SEPOLIA_RPC_URL_BACKUP|ARKIV_RPC_URL|ARKIV_CHAIN_ID|ARKIV_ACCESS_KEY)=' .env | tr -d '\r' > "$tmp"
    for k in ISSUER_PRIVATE_KEY ADMIN_TOKEN SEPOLIA_RPC_URL_BACKUP; do
      grep -q "^$k=" "$tmp" || { echo "missing $k in .env" >&2; rm -f "$tmp"; exit 1; }
    done
    scp -q $SSH_OPTS "$tmp" "$HOST:/tmp/unlink-issuer.env"
    rm -f "$tmp"
    ssh $SSH_OPTS "$HOST" 'sudo install -o root -g unlink -m 640 /tmp/unlink-issuer.env /etc/unlink/issuer.env && rm -f /tmp/unlink-issuer.env'
    echo "Secrets installed on $HOST (values not shown)."
    ;;
  db)
    # Exactly one issuer may ever run: refuse while the laptop issuer is up, and never overwrite a live database.
    if curl -s -m 2 -o /dev/null http://127.0.0.1:3000/health; then
      echo "The laptop issuer is still running on :3000. Stop it first; only one issuer may run." >&2; exit 1
    fi
    if ssh $SSH_OPTS "$HOST" 'sudo test -f /var/lib/unlink/issuer.db'; then
      echo "$HOST already has a database. Refusing to overwrite the live tree." >&2; exit 1
    fi
    # Fold the write-ahead log into the main file so a single file carries the whole state.
    (cd issuer && node -e 'const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync("issuer.db"); d.exec("PRAGMA wal_checkpoint(TRUNCATE)"); d.close();')
    scp -q $SSH_OPTS issuer/issuer.db "$HOST:/tmp/unlink-issuer.db"
    ssh $SSH_OPTS "$HOST" 'sudo install -o unlink -g unlink -m 600 /tmp/unlink-issuer.db /var/lib/unlink/issuer.db && rm -f /tmp/unlink-issuer.db && sudo systemctl start unlink-issuer && sleep 3 && systemctl is-active unlink-issuer'
    echo "Database installed and the issuer started. Keep the laptop issuer stopped from now on."
    ;;
  backup)
    out="issuer-backup-$(date +%Y%m%d-%H%M).db"
    ssh $SSH_OPTS "$HOST" 'sudo -u unlink /usr/local/bin/node -e "const { DatabaseSync } = require(\"node:sqlite\"); const d = new DatabaseSync(\"/var/lib/unlink/issuer.db\"); d.exec(\"VACUUM INTO '"'"'/var/lib/unlink/backup.db'"'"'\"); d.close();" && sudo cat /var/lib/unlink/backup.db && sudo rm -f /var/lib/unlink/backup.db' > "$out"
    echo "Backup written to $out (gitignored: *.db)."
    ;;
  *) echo "usage: push.sh <user@vm> secrets|db|backup" >&2; exit 1 ;;
esac
