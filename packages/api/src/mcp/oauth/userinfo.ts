import { logger } from '@librechat/data-schemas';

const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';
const MICROSOFT_ME = 'https://graph.microsoft.com/v1.0/me';

/**
 * Fetches the user's email from the OAuth provider's userinfo endpoint.
 * Returns the email (lowercase, trimmed) or 'default' if unavailable.
 */
export async function fetchOAuthUserEmail(
  serverName: string,
  accessToken: string,
): Promise<string> {
  const url = getUserinfoUrl(serverName);
  if (!url) {
    logger.debug(`[MCP OAuth] No userinfo URL for server ${serverName}, using default account`);
    return 'default';
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      logger.warn(`[MCP OAuth] Userinfo request failed for ${serverName}: ${res.status}`);
      return 'default';
    }
    const data = (await res.json()) as { email?: string; mail?: string; userPrincipalName?: string };
    const email =
      data.email ?? data.mail ?? data.userPrincipalName ?? '';
    const normalized = email.trim().toLowerCase();
    return normalized || 'default';
  } catch (error) {
    logger.warn(`[MCP OAuth] Failed to fetch userinfo for ${serverName}:`, error);
    return 'default';
  }
}

function getUserinfoUrl(serverName: string): string | null {
  const normalized = serverName.toLowerCase();
  if (normalized === 'google') return GOOGLE_USERINFO;
  if (normalized === 'microsoft') return MICROSOFT_ME;
  return null;
}
