#!/bin/sh
# One-time setup of the hosted issuer on a fresh Ubuntu 24.04 VM (Oracle Cloud Always Free; any Ubuntu VM works).
# Run on the VM as root:   sudo sh setup.sh <domain>      e.g.  sudo sh setup.sh unlink-issuer.duckdns.org
# Installs pinned Node and Caddy (checksums verified), the repo at /opt/unlink, the systemd units and the firewall
# rules. It does NOT install secrets or the database: those come from the laptop (README.md steps 5 and 6).
set -eu

DOMAIN="${1:?usage: sudo sh setup.sh <domain>}"
REF="${REF:-main}"
NODE_VERSION=22.13.1
CADDY_VERSION=2.10.0
REPO=https://github.com/Harshittgupta/Unlink.git

case "$(uname -m)" in
  aarch64) NODE_ARCH=arm64; CADDY_ARCH=arm64 ;;
  x86_64) NODE_ARCH=x64; CADDY_ARCH=amd64 ;;
  *) echo "unsupported CPU $(uname -m)" >&2; exit 1 ;;
esac

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git curl ca-certificates xz-utils iptables-persistent

# Small VMs (1 GB, e.g. E2.1.Micro): add swap so `npm ci` does not run out of memory.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

tmp=$(mktemp -d)
cd "$tmp"

# Node, pinned to the version the issuer is developed and tested on (node:sqlite unflagged since 22.13).
NODE_TAR="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TAR"
curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
grep " $NODE_TAR\$" SHASUMS256.txt | sha256sum -c -
tar -xJf "$NODE_TAR" -C /usr/local --strip-components=1

# Caddy: HTTPS (automatic Let's Encrypt certificate) in front of the issuer.
CADDY_TAR="caddy_${CADDY_VERSION}_linux_$CADDY_ARCH.tar.gz"
curl -fsSLO "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/$CADDY_TAR"
curl -fsSLO "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/caddy_${CADDY_VERSION}_checksums.txt"
grep " $CADDY_TAR\$" "caddy_${CADDY_VERSION}_checksums.txt" | sha512sum -c -
tar -xzf "$CADDY_TAR" caddy
install -m 755 caddy /usr/local/bin/caddy
cd / && rm -rf "$tmp"

# Users and directories. The database lives outside the code checkout so updates never touch it.
id unlink >/dev/null 2>&1 || useradd --system --home-dir /opt/unlink --shell /usr/sbin/nologin unlink
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy
install -d -o unlink -g unlink -m 700 /var/lib/unlink
install -d -o root -g unlink -m 750 /etc/unlink
install -d -o caddy -g caddy -m 700 /var/lib/caddy
install -d -o root -g root -m 755 /etc/caddy

# Code.
if [ -d /opt/unlink/.git ]; then git -C /opt/unlink fetch -q origin; else git clone -q "$REPO" /opt/unlink; fi
git -C /opt/unlink checkout -q "$REF"
git -C /opt/unlink pull -q --ff-only || true
chown -R unlink:unlink /opt/unlink
su -s /bin/sh unlink -c 'cd /opt/unlink/protocol && npm ci --omit=dev --ignore-scripts --no-audit --no-fund'
su -s /bin/sh unlink -c 'cd /opt/unlink/issuer && npm ci --ignore-scripts --no-audit --no-fund'

# Services.
sed "s/__DOMAIN__/$DOMAIN/" /opt/unlink/issuer/deploy/Caddyfile > /etc/caddy/Caddyfile
install -m 644 /opt/unlink/issuer/deploy/caddy.service /etc/systemd/system/caddy.service
install -m 644 /opt/unlink/issuer/deploy/unlink-issuer.service /etc/systemd/system/unlink-issuer.service
systemctl daemon-reload
systemctl enable --now caddy
systemctl enable unlink-issuer  # starts only once /var/lib/unlink/issuer.db exists (ConditionPathExists)

# Firewall: Oracle's Ubuntu images reject everything but SSH in iptables (on top of the cloud security list).
for port in 80 443; do
  iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
done
netfilter-persistent save

echo "Done. Next, from the laptop: push the secrets and the database (issuer/deploy/README.md steps 5-6)."
