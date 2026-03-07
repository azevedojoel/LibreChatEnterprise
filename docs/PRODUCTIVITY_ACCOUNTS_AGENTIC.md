# Productivity Accounts: Full Agentic Access

Agents with the `manage_productivity_accounts` capability can manage Google and Microsoft accounts entirely from chat—no UI required. Casey and other productivity agents use these tools to list, add, switch, and re-authenticate accounts.

## Tools

| Tool | Use case |
|------|----------|
| `list_productivity_accounts` | List connected accounts |
| `get_active_productivity_account` | Get active account for a provider |
| `select_productivity_account` | Switch active account |
| `add_productivity_account` | Add new account (OAuth) |
| `remove_productivity_account` | Remove a connected account |
| `check_productivity_accounts_auth` | Check if accounts need refresh/re-auth |
| `reauthenticate_productivity_account` | Initiate re-auth OAuth (expired/revoked) |

All seven tools are injected when the `manage_productivity_accounts` capability is enabled.

## Auth Status Semantics

`check_productivity_accounts_auth` returns per-account status:

- **ok** — Access token valid. Safe to use Gmail, Drive, Outlook, etc.
- **expired_refreshable** — Access token expired but refresh token exists. System will auto-refresh on next MCP call. Agent can proceed or warn the user.
- **expired_needs_reauth** — Access token expired and no refresh token. User must re-authenticate via `reauthenticate_productivity_account`.
- **not_connected** — No accounts for this provider.

## Agentic Flows

### Flow 1: First-time connect (no accounts)

1. User: "Connect my Gmail"
2. Agent: `list_productivity_accounts` → empty
3. Agent: `add_productivity_account(provider: 'google')` → oauthUrl
4. Agent: "Open this link to sign in. Tell me when done."
5. User completes OAuth
6. Agent: `list_productivity_accounts` → sees new account
7. Agent: `select_productivity_account(provider: 'google', accountId: 'user@gmail.com')` (optional; first account often auto-selected)

### Flow 2: Add another account

1. User: "Add my work Google account"
2. Agent: `add_productivity_account(provider: 'google')` → oauthUrl
3. Agent: "Open this link to sign in with your work account."
4. User completes OAuth
5. Agent: `list_productivity_accounts` → both accounts
6. Agent: `select_productivity_account(provider: 'google', accountId: 'work@gmail.com')` if user wants work as active

### Flow 3: Switch active account

1. User: "Use my work account for emails"
2. Agent: `list_productivity_accounts` → get accountIds
3. Agent: `select_productivity_account(provider: 'google', accountId: 'work@gmail.com')`
4. Agent: "Switched. Gmail and Drive will use work@gmail.com."

### Flow 4: Proactive auth check before task

1. User: "Check my Gmail"
2. Agent: `check_productivity_accounts_auth(provider: 'google')` → status per account
3. If any `expired_needs_reauth`: Agent calls `reauthenticate_productivity_account(provider: 'google')`, returns oauthUrl, asks user to sign in
4. If `ok` or `expired_refreshable`: Agent proceeds with Gmail MCP tools

### Flow 5: Re-auth after expired/revoked token

1. MCP call fails with auth error, or user: "My Google isn't working"
2. Agent: `check_productivity_accounts_auth(provider: 'google')` → `expired_needs_reauth`
3. Agent: `reauthenticate_productivity_account(provider: 'google')` → oauthUrl
4. Agent: "Your Google session expired. Open this link to sign in again."
5. User completes OAuth
6. Agent: "Re-authenticated. Try your request again."

### Flow 6: Check status on demand

1. User: "Are my accounts connected?"
2. Agent: `check_productivity_accounts_auth(provider: 'all')` → full status
3. Agent: Summarizes which accounts are ok, which need re-auth, which are active.

### Flow 7: Sub-agent auth check (Ellis → Casey)

1. User: "Check my email in account X"
2. Ellis: `run_sub_agent(Casey, "Check email in account X")`
3. Casey: `check_productivity_accounts_auth(provider: 'google')` → `expired_needs_reauth`
4. Casey: `reauthenticate_productivity_account(provider: 'google')` → oauthUrl
5. Casey returns to Ellis: "Account X needs re-authentication. Sign in here: [oauthUrl]. I cannot check email until you complete sign-in."
6. Ellis surfaces the re-auth link to the user and stops
7. User opens link, signs in, tells Ellis "I've signed in"
8. Ellis can re-run Casey or proceed

## Troubleshooting

### Adding a second account

The OAuth link includes `prompt=select_account` so the account chooser appears when adding another Google or Microsoft account. If the user does not see the account chooser, they may need to sign out of the current account first or use an incognito/private browser window.
