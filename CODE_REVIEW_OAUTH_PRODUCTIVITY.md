# Code Review: OAuth UX, Code Verifier Fix, and Productivity Account Tools

## Plan Verification

The OAuth UX and Code Verifier Fix plan has been implemented. Verified:

- [x] **Phase 1**: MCPConnectionFactory awaits flow persist (using Promise.race to avoid blocking)
- [x] **Phase 1**: AddProductivityAccount calls oauth/bind before openOAuthUrl
- [x] **Phase 2**: CacheKeys.OAUTH_CONNECT, getLogStores registration
- [x] **Phase 2**: productivityAccountTools createOAuthConnectUrl, short URL
- [x] **Phase 2**: GET /connect/:code redirect route
- [x] **Phase 2**: AddProductivityAccount uses connectUrl (fallback to oauthUrl)
- [x] **Phase 3**: Updated message text in tools

## Issues Found and Fixed

### 1. CRITICAL: createOAuthConnectUrl cache.set not awaited
**File**: `api/server/services/ProductivityAccounts/productivityAccountTools.js`
**Issue**: Keyv.set returns a Promise. Without await, the cache might not be written before the user clicks Connect, causing 404 on /connect/:code.
**Fix**: Made createOAuthConnectUrl async and added await for oauthConnectCache.set.

### 2. CRITICAL: createFlow blocks until user completes OAuth
**File**: `packages/api/src/mcp/MCPConnectionFactory.ts`
**Issue**: FlowStateManager.createFlow returns monitorFlow which blocks until the flow completes. Awaiting it would deadlock—we'd never return oauthUrl until the user completes OAuth, but the user needs oauthUrl to complete.
**Fix**: Use Promise.race([createFlowPromise, 400ms]) so we wait for the keyv.set to complete (~250ms + write) then return oauthUrl without blocking on user completion. Matches pattern used in mcp.js initiate route.

### 3. MINOR: Unused import
**File**: `api/server/services/ProductivityAccounts/productivityAccountTools.js`
**Fix**: Removed unused Constants import.

## Auth Tools Deep Dive

### Tool Inventory
| Tool | Purpose | Params | Notes |
|------|---------|--------|-------|
| list_productivity_accounts | List connected accounts | provider?: google/microsoft/all | Uses MCPTokenStorage.listAccountsForServer |
| get_active_productivity_account | Get active account | provider | Uses MCPActiveAccountStorage.getActiveAccount |
| select_productivity_account | Set active account | provider, accountId | Uses MCPActiveAccountStorage.setActiveAccount |
| add_productivity_account | Add new account (OAuth) | provider | Returns connectUrl via short code |
| check_productivity_accounts_auth | Check auth status | provider?: google/microsoft/all | Returns ok/expired_refreshable/expired_needs_reauth/not_connected |
| reauthenticate_productivity_account | Initiate re-auth OAuth | provider | Returns connectUrl via short code |
| remove_productivity_account | Remove account | provider, accountId | Deletes tokens, updates active if needed |

### Security
- connectUrl hides raw oauthUrl from model (short code redirect)
- Duplicate account check in OAuth callback (same email)
- CSRF validation via oauth/bind before opening URL
- All tools scoped by userId from request context

### Edge Cases
- **Legacy "default" account**: check_productivity_accounts_auth uses identifier `mcp:${serverName}` for default
- **Multi-account**: identifier `mcp:${serverName}:${accountId}` for non-default
- **Remove last account**: Clears active account setting
- **Provider not configured**: Returns error with admin guidance

## No Major Issues Remaining

The implementation is sound. The fixes address the critical race conditions. Ready for logical commits.
