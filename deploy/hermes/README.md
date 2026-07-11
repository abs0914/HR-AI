# Hermes Container

This deployment uses the official `nousresearch/hermes-agent:latest` image.

The container runs:

```bash
hermes gateway run
```

Required production settings are provided through `.env.production` and `docker-compose.yml`:

- `API_SERVER_ENABLED=true`
- `API_SERVER_HOST=0.0.0.0`
- `API_SERVER_PORT=8642`
- `API_SERVER_KEY=<strong secret>`

Hermes state is persisted in the Docker volume `hermes_data`, mounted at `/opt/data`.

## HR-AI MCP Tool Server

Configure Hermes to use HR-AI as an MCP server:

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

For safest operation, keep Hermes on the private Docker network and expose only the guarded `hermes.kawaniai.com` API through Caddy.
