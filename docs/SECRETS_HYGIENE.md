# Secrets Hygiene and .env Removal from Git

If `.env` was ever committed to the repository, secrets may be exposed in git history. This runbook describes how to remove `.env` from history and start fresh.

**Preferred path when you have no production data:** Wipe the database and Redis, remove `.env` from git history, generate new secrets, and redeploy. No migration of encrypted data is needed.

## Prerequisites

- Git with a clean working tree (commit or stash changes)
- `git-filter-repo` installed: `brew install git-filter-repo` or `pip install git-filter-repo`
- Access to force-push to the remote (coordinate with collaborators)

## Step 1: Backup (Optional)

If you have data to preserve, back up MongoDB and Redis before proceeding. For a fresh start, skip this step.

```bash
# MongoDB backup (if needed)
mongodump --uri="$MONGO_URI" --out=./backup-$(date +%Y%m%d)

# Redis backup (if needed)
redis-cli BGSAVE
```

## Step 2: Wipe MongoDB and Redis

Reset all persisted data so there is no encrypted data tied to the old `CREDS_KEY`.

```bash
# MongoDB: drop all databases or recreate
mongosh "$MONGO_URI" --eval "db.dropDatabase()"

# Redis: flush all keys
redis-cli FLUSHALL
# Or, if using Railway/remote Redis:
# redis-cli -u "$REDIS_URI" FLUSHALL
```

## Step 3: Remove .env from Git History

This rewrites git history. **All collaborators must re-clone after you force-push.**

```bash
# Clone a fresh copy to avoid corrupting your working copy
cd /tmp
git clone /path/to/LibreChatEnterprise librechat-clean
cd librechat-clean

# Remove .env from all commits
git filter-repo --path .env --invert-paths

# Force-push (destructive; coordinate with team)
git remote add origin <your-remote-url>
git push --force origin main
```

If you prefer to work in your existing repo:

```bash
git filter-repo --path .env --invert-paths
git push --force origin main
```

**Warning:** `git filter-repo` removes the `origin` remote by default. Re-add it before pushing.

## Step 4: Generate New Secrets

Rotate every secret that may have been in `.env`. Use cryptographically secure random values.

```bash
# CREDS_KEY: 64 hex chars (32 bytes) for AES-256
openssl rand -hex 32

# CREDS_IV: 32 hex chars (16 bytes) for legacy AES-CBC IV
openssl rand -hex 16

# JWT_SECRET and JWT_REFRESH_SECRET: 64 hex chars
openssl rand -hex 32
```

**Secrets to rotate:**

| Variable | Purpose |
|----------|---------|
| `CREDS_KEY` | Encrypts user keys, OAuth tokens, MCP configs |
| `CREDS_IV` | Legacy AES-CBC IV (used with `CREDS_KEY`) |
| `JWT_SECRET` | Signs access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens |
| `MONGO_URI` | Database credentials (if exposed) |
| `MEILI_MASTER_KEY` | Meilisearch master key (if exposed) |
| Any API keys | LLM providers, email, etc. |

## Step 5: Update Environment

1. Create a new `.env` from `.env.example`
2. Fill in the new secrets; **never commit `.env`**
3. Ensure `.env` is in `.gitignore` (it is by default)
4. Update deployment platform variables (Railway, Docker, etc.) with the new values

## Step 6: Redeploy

Deploy with the new secrets. All users will need to log in again (JWT secrets changed). Any previously encrypted data in the DB was wiped, so the app starts clean.

## Verification

```bash
# Confirm .env is not in history
git log -p --all -- .env
# Should show no results

# Confirm .env is gitignored
git check-ignore -v .env
# Should report .env is ignored
```

## Prevention

- Never commit `.env` or `.env.local`
- Use `.env.example` as a template with placeholder values only
- Store production secrets in a secrets manager or deployment platform variables
- Consider a pre-commit hook to reject commits that add `.env` (optional)
