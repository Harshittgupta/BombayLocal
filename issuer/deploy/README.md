# Hosting the issuer (Oracle Cloud Always Free)

The issuer is the only BombayLocal component that needs a server. It runs the purchase endpoint, auto-publishes roots to
Sepolia and Arkiv, and posts a heartbeat root every 6 h. Showing and scanning a pass never use it, and phones refresh
from Sepolia and Arkiv directly.

**What the host must provide:**
- Node 22.13 (installed by `setup.sh`).
- Always on, so the timers keep running.
- A persistent disk for `issuer.db`.
- **Exactly one instance**: one issuer key, one writer.
- A public HTTPS address.
- About 512 MB RAM.

An Oracle Cloud *Always Free* VM provides all of this at no cost. Any Ubuntu 24.04 VM works the same way.

Layout on the VM:

| Path | What |
|---|---|
| `/opt/unlink` | git checkout (read-only for the service) |
| `/var/lib/unlink/issuer.db` | the database (mode 600, user `unlink`) |
| `/etc/unlink/issuer.env` | secrets (mode 640) |
| `unlink-issuer.service` | the issuer, listening on `127.0.0.1:3000` |
| `caddy.service` | HTTPS on 443 with an automatic Let's Encrypt certificate. No access log, so no client IPs are recorded |

## 1. Account and region
Sign up at <https://signup.cloud.oracle.com>. Oracle asks for a card to verify identity; Always Free resources are not
charged. Choose **India West (Mumbai)** or **India South (Hyderabad)** as the home region. Always Free compute exists
only in the home region, and the choice is permanent.

## 2. SSH key (on the laptop)
```sh
ssh-keygen -t ed25519 -f ~/.ssh/unlink_oci -C unlink-issuer
```
Upload `~/.ssh/unlink_oci.pub` in the next step. Never share or commit the private key.

## 3. Create the VM
1. Open **Compute → Instances → Create instance**.
2. **Image:** Canonical **Ubuntu 24.04**.
3. **Shape:** Ampere **VM.Standard.A1.Flex**, 1 OCPU and 6 GB, which is Always Free. If Oracle reports *out of
   capacity*, use **VM.Standard.E2.1.Micro** instead (also Always Free; `setup.sh` adds swap for its 1 GB of RAM).
4. **Networking:** create a new VCN with a **public subnet**, and tick **Assign a public IPv4 address**.
5. **SSH keys:** paste `unlink_oci.pub`.
6. **Open ports 80 and 443:** go to the instance's subnet → **Security List → Add Ingress Rules**. Add source
   `0.0.0.0/0`, TCP, destination port **80**, then the same for **443**. Port 22 is open by default.
7. Note the instance's **public IP**.

## 4. A name for HTTPS (DuckDNS, free)
Sign in at <https://www.duckdns.org>, create a subdomain (for example `unlink-issuer`), and set its IP to the VM's public
IP. The issuer's address is then `https://bombaylocal-issuer.duckdns.org`. Caddy needs this name to get a certificate.

## 5. Set up the VM
```sh
ssh -i ~/.ssh/unlink_oci ubuntu@<public-ip>
curl -fsSLO https://raw.githubusercontent.com/Harshittgupta/BombayLocal/main/issuer/deploy/setup.sh
sudo sh setup.sh bombaylocal-issuer.duckdns.org
exit
```
`setup.sh` does the following:
- installs Node 22.13.1 and Caddy 2.10.0, verifying their published checksums;
- clones the repo and runs `npm ci`;
- installs both services and opens 80/443 in the VM's own firewall.

The issuer does not start yet, because it has no database.

## 6. Secrets and database (on the laptop, repo root)
Run these on the laptop, from the repo root:
```sh
# 1. Stop the laptop issuer (Ctrl+C in its terminal). Only one issuer may ever run.
# 2. Copy the secrets the issuer needs from .env (values are never printed):
SSH_KEY=~/.ssh/unlink_oci sh issuer/deploy/push.sh ubuntu@<public-ip> secrets
# 3. Copy the database and start the service. This refuses if the laptop issuer is still up or the VM already has one:
SSH_KEY=~/.ssh/unlink_oci sh issuer/deploy/push.sh ubuntu@<public-ip> db
```

## 7. Check
```sh
curl https://bombaylocal-issuer.duckdns.org/health                  # {"ok":true}
ssh -i ~/.ssh/unlink_oci ubuntu@<public-ip> 'journalctl -u unlink-issuer -n 20 --no-pager'
```
Then set **Issuer URL** in both apps' Settings to `https://bombaylocal-issuer.duckdns.org`. From then on, buying and scan
uploads work from any network, with no cable and no laptop.

## Updating, backups, rules
- **Update:** push to `main`, then run `ssh … 'sudo sh /opt/unlink/issuer/deploy/update.sh'`.
- **Backup:** `SSH_KEY=… sh issuer/deploy/push.sh ubuntu@<public-ip> backup` writes `~/unlink-backups/issuer-backup-<date>.db`
  on the laptop (outside the repo, mode 600).
- **Never run `npm start` with the live issuer key anywhere else while the VM is up.** Two writers would post
  conflicting roots.
- **The database is the issuer's memory.** Losing it means the issuer cannot continue its tree. Back it up before risky
  changes.
