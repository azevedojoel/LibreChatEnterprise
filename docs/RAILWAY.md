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
