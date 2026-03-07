import { logger, encryptEnvelope, decryptUniversal } from '@librechat/data-schemas';
import type { TokenMethods } from '@librechat/data-schemas';
import { isSystemUserId } from '~/mcp/enum';

const ACTIVE_ACCOUNT_IDENTIFIER_SUFFIX = ':active';

export class MCPActiveAccountStorage {
  static getLogPrefix(userId: string, serverName: string): string {
    return isSystemUserId(userId)
      ? `[MCP][${serverName}]`
      : `[MCP][User: ${userId}][${serverName}]`;
  }

  /**
   * Gets the active account ID for a server. Returns null if not set.
   */
  static async getActiveAccount({
    userId,
    serverName,
    findToken,
  }: {
    userId: string;
    serverName: string;
    findToken: TokenMethods['findToken'];
  }): Promise<string | null> {
    const identifier = `mcp:${serverName}${ACTIVE_ACCOUNT_IDENTIFIER_SUFFIX}`;
    try {
      const tokenData = await findToken({
        userId,
        type: 'mcp_oauth_active',
        identifier,
      });
      if (!tokenData?.token) return null;
      const decrypted = await decryptUniversal(tokenData.token);
      return decrypted || null;
    } catch (error) {
      logger.debug(`${this.getLogPrefix(userId, serverName)} Failed to get active account`, error);
      return null;
    }
  }

  /**
   * Sets the active account for a server.
   */
  static async setActiveAccount({
    userId,
    serverName,
    accountId,
    createToken,
    updateToken,
    findToken,
  }: {
    userId: string;
    serverName: string;
    accountId: string;
    createToken: TokenMethods['createToken'];
    updateToken: TokenMethods['updateToken'];
    findToken: TokenMethods['findToken'];
  }): Promise<void> {
    const logPrefix = this.getLogPrefix(userId, serverName);
    const identifier = `mcp:${serverName}${ACTIVE_ACCOUNT_IDENTIFIER_SUFFIX}`;
    try {
      const encrypted = await encryptEnvelope(accountId);
      const tokenData = {
        userId,
        type: 'mcp_oauth_active',
        identifier,
        token: encrypted,
        expiresIn: 365 * 24 * 60 * 60, // 1 year
      };
      const existing = await findToken({ userId, type: 'mcp_oauth_active', identifier });
      if (existing) {
        await updateToken({ userId, identifier }, tokenData);
        logger.debug(`${logPrefix} Updated active account to ${accountId}`);
      } else {
        await createToken(tokenData);
        logger.debug(`${logPrefix} Set active account to ${accountId}`);
      }
    } catch (error) {
      logger.error(`${logPrefix} Failed to set active account`, error);
      throw error;
    }
  }

  /**
   * Clears the active account setting (reverts to first-available behavior).
   */
  static async clearActiveAccount({
    userId,
    serverName,
    deleteToken,
  }: {
    userId: string;
    serverName: string;
    deleteToken: (filter: { userId: string; type: string; identifier: string }) => Promise<void>;
  }): Promise<void> {
    const identifier = `mcp:${serverName}${ACTIVE_ACCOUNT_IDENTIFIER_SUFFIX}`;
    await deleteToken({ userId, type: 'mcp_oauth_active', identifier });
  }
}
