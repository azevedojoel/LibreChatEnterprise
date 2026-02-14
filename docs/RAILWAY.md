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
