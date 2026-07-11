# Production Deployment

This app is designed to run on VPS `62.84.186.219` with Cloudflare DNS for `kawaniai.com`.

## Cloudflare DNS

Create these records:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| A | `@` | `62.84.186.219` | On |
| CNAME | `www` | `kawaniai.com` | On |
| A | `hermes` | `62.84.186.219` | On |

After Caddy has issued certificates, set SSL/TLS mode to **Full (strict)** and enable **Always Use HTTPS**.

## VPS Bootstrap

SSH into the server, then install Docker:

```bash
apt update
apt install -y ca-certificates curl ufw git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## App Deploy

```bash
mkdir -p /opt/hr-ai
git clone <your-repo-url> /opt/hr-ai
cd /opt/hr-ai
cp .env.production.example .env.production
```

Fill `.env.production` with real Supabase, AI, PayMongo, Hermes, and MCP values.

Generate secrets:

```bash
openssl rand -hex 32 # HERMES_API_KEY
openssl rand -hex 32 # HERMES_MCP_TOKEN
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-strong-hermes-password'
```

Start the stack:

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

## Hermes Setup

Hermes state is stored in the `hermes_data` Docker volume. If this is the first run, initialize the Hermes profile once:

```bash
docker compose --env-file .env.production run --rm hermes setup
docker compose --env-file .env.production up -d hermes
```

Add HR-AI as a Hermes MCP server in the Hermes config:

```yaml
mcp_servers:
  hr_ai:
    url: "http://hr-ai:3000/api/mcp"
    headers:
      Authorization: "Bearer ${HERMES_MCP_TOKEN}"
    tools:
      include:
        - search_employee
        - get_employee_profile
        - list_pending_leaves
        - search_company_policies
        - list_compliance_reminders
        - generate_document
        - create_employee_draft
```

Restart Hermes after config changes:

```bash
docker compose --env-file .env.production restart hermes
```

## Smoke Tests

```bash
curl -I https://kawaniai.com
curl https://kawaniai.com/api/health
curl -u "$HERMES_BASIC_AUTH_USER:your-strong-hermes-password" https://hermes.kawaniai.com/health
docker compose --env-file .env.production logs --tail=100 hr-ai
docker compose --env-file .env.production logs --tail=100 hermes
```

Test MCP from inside the Docker network:

```bash
docker compose --env-file .env.production exec hr-ai sh -lc 'curl -s http://localhost:3000/api/mcp \
  -H "content-type: application/json" \
  -H "authorization: Bearer $HERMES_MCP_TOKEN" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"'
```

## External Services

- Supabase Auth redirect URLs should include `https://kawaniai.com`.
- PayMongo webhook should point to `https://kawaniai.com/api/billing/webhook`.
- Keep `hermes.kawaniai.com` protected; do not expose unauthenticated Hermes APIs publicly.
