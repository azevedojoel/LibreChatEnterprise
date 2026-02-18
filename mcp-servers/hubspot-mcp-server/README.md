# HubSpot MCP Server

MCP server for HubSpot CRM API integration (contacts, companies, deals, tickets, associations, notes, tasks).

## OAuth redirect URLs

Add deployment domains in **`hubspot-oauth-redirect-urls.json`** at this package root (single source of truth). The format is:

```json
[
  "http://localhost:3080/api/mcp/HubSpot/oauth/callback",
  "https://app.dailythread.ai/api/mcp/HubSpot/oauth/callback"
]
```

Then sync and upload to HubSpot:

```bash
npm run hubspot:sync      # Writes URLs into Daily Thread/src/app/app-hsmeta.json
npm run hubspot:upload    # Syncs + runs hs project upload
```

The `app-hsmeta.json` lives in `Daily Thread/src/app/` because the HubSpot CLI requires that structure. Do not edit it directly—edit `hubspot-oauth-redirect-urls.json` instead, then run `npm run hubspot:sync` before uploading.
