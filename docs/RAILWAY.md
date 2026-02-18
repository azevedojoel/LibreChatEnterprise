# Railway Deployment – Env With Code

Manage env vars from your repo instead of the Railway UI.

## Setup

1. **Create your env file** (gitignored):
   ```bash
   cp .env.railway.example .env.railway
   ```

2. **Fill in `.env.railway`**:
   - Use Railway IDs from the dashboard (Cmd+K)
   - Use `${{MongoDB.MONGO_URL}}` if you have the MongoDB plugin
   - Add your API keys and secrets

3. **Get a Railway token**: https://railway.com/account/tokens

## Sync Env to Railway

```bash
# Option A: Use env vars for the script
export RAILWAY_TOKEN=your-token
export RAILWAY_PROJECT_ID=your-project-id      # from Cmd+K in dashboard
export RAILWAY_ENVIRONMENT_ID=your-env-id
export RAILWAY_SERVICE_ID=your-librechat-service-id  # optional

node scripts/sync-railway-env.js
```

```bash
# Option B: Put RAILWAY_* in .env.railway (they won't be synced to the app)
# Then:
RAILWAY_TOKEN=xxx RAILWAY_PROJECT_ID=xxx RAILWAY_ENVIRONMENT_ID=xxx \
  node scripts/sync-railway-env.js .env.railway
```

## What Lives Where

| In Repo (code) | Railway UI or .env.railway |
|----------------|----------------------------|
| `librechat.yaml` – interface, endpoints, capabilities | Secrets: JWT, CREDS, API keys |
| `railway.toml` – build/deploy config | MONGO_URI, MEILI_MASTER_KEY |
| `.env.railway.example` – template | DOMAIN_CLIENT, DOMAIN_SERVER |

**Keep in repo:** `librechat.yaml`, `railway.toml`, config defaults.  
**Keep in `.env.railway` (local, gitignored):** Secrets and sync with the script.

## Deploy

```bash
railway up
# or push to your connected repo
```

Build and deploy behavior comes from `railway.toml`. Env vars come from Railway Variables (synced by the script).

## Required Variables for Full Functionality

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs access tokens. Must match across deploys if users share sessions. |
| `JWT_REFRESH_SECRET` | Signs refresh tokens. Must match `JWT_SECRET`'s deployment. |
| `DOMAIN_CLIENT` | Full production URL (e.g. `https://app.example.com`). No trailing slash. |
| `DOMAIN_SERVER` | Same as `DOMAIN_CLIENT` for single-host deployments. |
| `LIBRECHAT_CODE_API_KEY` | Set to `local` for in-process Python execution. Omit or use an API key for remote (E2B/Replit) execution. |
| `TRUST_PROXY` | Set to `1` so the app correctly sees `X-Forwarded-Proto` and sets cookies with `secure: true`. |

**Note:** `LIBRECHAT_CODE_LOCAL` in `.env.example` is not used by the codebase. Use `LIBRECHAT_CODE_API_KEY=local` instead to enable local code execution.

## Redis (Required for Scheduled Agents)

Redis is required for reliable scheduled agent runs, sessions, stream job storage, and multi-instance deployments.

### Setup

1. Add Redis to your project: Railway dashboard -> your project -> Ctrl/Cmd+K -> **New** -> **Database** -> **Redis** (or deploy from [Redis template](https://railway.com/template/redis)).
2. In your LibreChat service variables, set:
   ```
   USE_REDIS=true
   REDIS_URI=${{Redis.REDIS_URL}}
   ```
   Replace `Redis` with your Redis service name if you named it differently. Railway provides `REDIS_URL`; LibreChat also accepts `REDIS_URL` directly if set.
3. Sync with `node scripts/sync-railway-env.js` or add these in the Railway UI.

Without Redis, scheduled agent "run now" uses fire-and-forget and jobs may be lost on restart. When scheduled agents are enabled (default), the app fails startup if Redis is not configured. Set `SCHEDULED_AGENTS_REQUIRE_REDIS=false` to opt out of this check (not recommended for production).

## Google Workspace MCP (OAuth)

If you use the Google Workspace MCP server (`mcpServers.google-workspace` in `librechat.yaml`), you must:

1. Set `GOOGLE_WORKSPACE_CLIENT_ID` and `GOOGLE_WORKSPACE_CLIENT_SECRET` in Railway variables.
2. In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your OAuth client:
   - Add this exact URL to **Authorized redirect URIs**:
     ```
     https://YOUR-RAILWAY-URL/api/mcp/google-workspace/oauth/callback
     ```
   - Replace `YOUR-RAILWAY-URL` with your actual domain (e.g. `your-app.up.railway.app` or your custom domain).

## Microsoft 365 MCP (OAuth)

If you use the Microsoft 365 MCP server (`mcpServers.ms-365` in `librechat.yaml`), you must:

1. Set `MS365_MCP_CLIENT_ID` and `MS365_MCP_CLIENT_SECRET` in Railway variables.
2. In [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations → New registration:
   - Create an app (e.g. "LibreChat MS 365 MCP")
   - Under Authentication → Add a platform → Web:
     - Add this exact URL to **Redirect URIs**:
       ```
       https://YOUR-RAILWAY-URL/api/mcp/ms-365/oauth/callback
       ```
     - Replace `YOUR-RAILWAY-URL` with your actual domain (e.g. `your-app.up.railway.app` or your custom domain).
   - Under API permissions → Add Microsoft Graph delegated permissions for the scopes used in `librechat.yaml` (e.g. User.Read, Mail.ReadWrite, Calendars.ReadWrite, Files.ReadWrite, etc.)
   - Create a client secret under Certificates & secrets and use it as `MS365_MCP_CLIENT_SECRET`.

## HubSpot MCP (OAuth)

If you use the HubSpot MCP server (`mcpServers.HubSpot` in `librechat.yaml`), you must:

1. Set `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` in Railway variables.
2. In [HubSpot Developer Portal](https://developers.hubspot.com/) → your app → Auth:
   - Add this exact URL to **Redirect URIs**:
     ```
     https://YOUR-RAILWAY-URL/api/mcp/HubSpot/oauth/callback
     ```
   - Replace `YOUR-RAILWAY-URL` with your actual domain (e.g. `your-app.up.railway.app` or your custom domain).

## allowedDomains (librechat.yaml)

If you use Actions or features that connect to external domains, update `allowedDomains` in `librechat.yaml` for production:

- For default Railway URLs, add: `'*.up.railway.app'`
- For a custom domain, add: `'*.yourdomain.com'` or the specific host

## Code Executor (execute_code)

The code executor can run **locally** (Python in-process) or **remotely** (E2B, Replit, etc.):

- **Local:** Set `LIBRECHAT_CODE_API_KEY=local` or leave it unset. No external API key needed.
- **Remote:** Set `LIBRECHAT_CODE_API_KEY` to a valid E2B/Replit API key. Users can also provide keys via credentials.

If you see `Execution error: HTTP error! status: 401` or `[ON_TOOL_EXECUTE] Tool execute_code error`, the system is using remote execution with an invalid or expired API key. Fix by setting `LIBRECHAT_CODE_API_KEY=local` to force local execution.

## JWT and Refresh Token Issues

If you see `[refreshController] Invalid refresh token: invalid signature` in logs:

- **Cause:** Tokens were signed with a different `JWT_SECRET` / `JWT_REFRESH_SECRET` than the one the server is now using (e.g. local vs Railway, or after rotating secrets).
- **Fix:** Users must log out and log in again on the Railway URL. New tokens will be signed with the current secrets.

Secrets must be identical across all instances that share the same user sessions. If you change them, all users need to re-authenticate.

## Troubleshooting Checklist

| Symptom | Likely cause | Action |
|---------|---------------|--------|
| Code executor returns 401 | Remote execution with invalid API key | Set `LIBRECHAT_CODE_API_KEY=local` |
| Code executor returns 500 | Same as above, or Python not installed in container | Use `local`, ensure `python3` in PATH |
| "Invalid refresh token: invalid signature" | JWT secret mismatch | Users: log out and log in again |
| Auth works locally, 401 on Railway | Different `JWT_SECRET` between envs | Use same secrets or have users re-login on Railway |
| Cookies not sent / auth fails after token expiry | `TRUST_PROXY` or domain misconfiguration | Set `TRUST_PROXY=1`, correct `DOMAIN_*` |
| "USE_REDIS is enabled but REDIS_URI is not set" | Redis not configured | Add Redis service, set `USE_REDIS=true` and `REDIS_URI=${{Redis.REDIS_URL}}` |
| Scheduled agent runs not persisting / lost on restart | Redis not configured | Add Redis service and configure as above |
