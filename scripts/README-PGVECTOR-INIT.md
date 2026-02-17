# Fix RAG pgvector: "relation langchain_pg_collection does not exist"

The RAG API uses LangChain's PGVector, which expects these tables in PostgreSQL. Railway's pgvector database may not have them by default. Run the init script **once** to create them.

---

## Step 1: Get your pgvector connection string

1. Open **Railway Dashboard** → your project → **pgvector** service
2. Go to **Variables** (or **Settings** → **Variables**)
3. Copy **`DATABASE_URL`** (for internal) or **`DATABASE_PUBLIC_URL`** (for running from your laptop)

Example:
```
postgres://postgres:PASSWORD@pgvector.railway.internal:5432/railway
```
or (public):
```
postgresql://postgres:PASSWORD@pgvector-production-xxxx.proxy.rlwy.net:12345/railway
```

---

## Step 2: Run the init script

### Option A: Using psql (recommended)

```bash
# From your LibreChatEnterprise project directory
psql "YOUR_DATABASE_URL" -f scripts/init-pgvector-rag.sql
```

Replace `YOUR_DATABASE_URL` with the actual connection string (in quotes).

### Option B: Using Railway CLI

```bash
# Link to pgvector first (if not already)
railway link  # select project + pgvector service

# Run SQL via stdin
railway run psql $DATABASE_URL -f scripts/init-pgvector-rag.sql
```

### Option C: Manual copy-paste

1. Open `scripts/init-pgvector-rag.sql`
2. Connect to pgvector using any PostgreSQL client (TablePlus, DBeaver, etc.)
3. Paste and execute the contents

---

## Step 3: Verify

After running the script, you should see:

```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
```

---

## Step 4: Redeploy / retry

- No need to redeploy—the RAG API reads from the same DB
- Send another inbound email with a PDF attachment, or upload a file in chat with file_search

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `extension "vector" does not exist` | Railway pgvector template should include it. If using plain Postgres, add pgvector or use Railway's pgvector template. |
| `permission denied` | Ensure the DB user has CREATE privileges. |
| `relation already exists` | Tables are already created. You're done. |

---

## Connection from your machine

If `DATABASE_URL` only has `railway.internal`, it won't work from your laptop. Use **`DATABASE_PUBLIC_URL`** from the pgvector service, or:

1. Railway Dashboard → pgvector → **Settings** → **Networking**
2. Add a **TCP Proxy** for port 5432
3. Use the provided host:port in your connection string
