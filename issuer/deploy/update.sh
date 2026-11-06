#!/bin/sh
# Run on the VM as root after pushing new issuer code to GitHub:   sudo sh /opt/unlink/issuer/deploy/update.sh
# Pulls main, reinstalls exactly the locked dependencies and restarts the service. The database is not touched.
set -eu
# git runs as the checkout owner: git refuses root on a repo owned by another user ("dubious ownership").
su -s /bin/sh unlink -c 'git -C /opt/unlink pull -q --ff-only'
su -s /bin/sh unlink -c 'cd /opt/unlink/protocol && npm ci --omit=dev --ignore-scripts --no-audit --no-fund'
su -s /bin/sh unlink -c 'cd /opt/unlink/issuer && npm ci --ignore-scripts --no-audit --no-fund'
install -m 644 /opt/unlink/issuer/deploy/unlink-issuer.service /etc/systemd/system/unlink-issuer.service
# Caddy config from the repo template, keeping this server's domain; validated before the reload.
DOMAIN=$(grep -m1 -oE '^[A-Za-z0-9.-]+\.[A-Za-z]{2,} \{$' /etc/caddy/Caddyfile | cut -d' ' -f1)
sed "s/__DOMAIN__/$DOMAIN/" /opt/unlink/issuer/deploy/Caddyfile > /etc/caddy/Caddyfile.new
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl reload caddy
systemctl daemon-reload
systemctl restart unlink-issuer
sleep 3
systemctl is-active unlink-issuer
su -s /bin/sh unlink -c "git -C /opt/unlink log -1 --format='Running %h %s'"
