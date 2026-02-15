import { logger } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isMCPDomainAllowed, extractMCPServerDomain } from '~/auth/domain';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPDomainNotAllowedError, MCPInspectionFailedError } from '~/mcp/errors';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { extractServerNameFromUrl } from '~/mcp/utils';

const DISCOVER_SERVER_NAME = '_discover';
/** Short timeout for discovery - fail fast when server returns 401 (no OAuth handler) */
const DISCOVER_CONNECT_TIMEOUT_MS = 5000;

export interface DiscoverFromUrlResult {
  transport: 'streamable-http' | 'sse';
  tools: Array<{ name: string; description?: string }>;
  requiresOAuth: boolean;
  oauthMetadata?: Record<string, unknown> | null;
  suggestedTitle: string;
  capabilities?: string;
}

/**
 * Discovers MCP server capabilities from a URL.
 * Tries streamable-http first, then falls back to SSE (legacy transport).
 * Validates domain against allowlist before attempting connection.
 */
export async function discoverFromUrl(
  url: string,
  allowedDomains?: string[] | null,
): Promise<DiscoverFromUrlResult> {
  const normalizedUrl = normalizeUrl(url);

  const configForDomainCheck = { url: normalizedUrl };
  const isDomainAllowed = await isMCPDomainAllowed(configForDomainCheck, allowedDomains);
  if (!isDomainAllowed) {
    const domain = extractMCPServerDomain(configForDomainCheck);
    throw new MCPDomainNotAllowedError(domain ?? 'unknown');
  }

  const useSSRFProtection =
    !Array.isArray(allowedDomains) || allowedDomains.length === 0;

  const oauthResult = await detectOAuthRequirement(normalizedUrl);

  const transports: Array<'streamable-http' | 'sse'> = ['streamable-http', 'sse'];
  let lastError: Error | null = null;

  for (const transport of transports) {
    const config =
      transport === 'streamable-http'
        ? {
            type: 'streamable-http' as const,
            url: normalizedUrl,
            initTimeout: DISCOVER_CONNECT_TIMEOUT_MS,
          }
        : {
            type: 'sse' as const,
            url: normalizedUrl,
            initTimeout: DISCOVER_CONNECT_TIMEOUT_MS,
          };

    try {
      const result = await MCPConnectionFactory.discoverTools({
        serverName: DISCOVER_SERVER_NAME,
        serverConfig: config,
        useSSRFProtection,
      });

      // Auth required but no tools without sign-in: return partial success (skip SSE retry)
      if (result.tools === null && result.oauthRequired) {
        logger.debug(
          `[MCP][Discover] Server requires auth, returning partial result (skip SSE retry)`,
        );
        return {
          transport,
          tools: [],
          requiresOAuth: true,
          oauthMetadata: oauthResult.metadata ?? null,
          suggestedTitle: extractServerNameFromUrl(normalizedUrl) || 'MCP Server',
          capabilities: undefined,
        };
      }

      // tools: null for streamable-http - assume auth required, skip pointless SSE retry
      if (result.tools === null && transport === 'streamable-http') {
        logger.debug(
          `[MCP][Discover] Streamable-http got no tools, returning partial result (skip SSE retry)`,
        );
        return {
          transport: 'streamable-http',
          tools: [],
          requiresOAuth: true,
          oauthMetadata: oauthResult.metadata ?? null,
          suggestedTitle: extractServerNameFromUrl(normalizedUrl) || 'MCP Server',
          capabilities: undefined,
        };
      }

      // tools: null for SSE - connection failed, give up
      if (result.tools === null) {
        throw new Error(`No tools discovered via ${transport}`);
      }

      const tools = result.tools.map((t: Tool) => ({
        name: t.name,
        description: t.description,
      }));

      logger.debug(
        `[MCP][Discover] Successfully discovered ${tools.length} tools via ${transport}`,
      );

      return {
        transport,
        tools,
        requiresOAuth: oauthResult.requiresOAuth || result.oauthRequired,
        oauthMetadata: oauthResult.metadata ?? null,
        suggestedTitle: extractServerNameFromUrl(normalizedUrl) || 'MCP Server',
        capabilities: undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errMsg = lastError.message.toLowerCase();
      const isOAuthRelated =
        errMsg.includes('oauth') ||
        errMsg.includes('401') ||
        errMsg.includes('unauthorized') ||
        errMsg.includes('authentication required');
      // Auth-required servers (e.g. Stripe) fail both transports - return partial instead of retrying SSE
      if (transport === 'streamable-http' && isOAuthRelated) {
        logger.debug(
          `[MCP][Discover] Streamable-http failed with auth error, returning partial result (skip SSE retry)`,
        );
        return {
          transport: 'streamable-http',
          tools: [],
          requiresOAuth: true,
          oauthMetadata: oauthResult.metadata ?? null,
          suggestedTitle: extractServerNameFromUrl(normalizedUrl) || 'MCP Server',
          capabilities: undefined,
        };
      }
      logger.debug(
        `[MCP][Discover] ${transport} failed, trying next transport:`,
        lastError.message,
      );
      if (transport === 'sse') {
        break;
      }
    }
  }

  throw new MCPInspectionFailedError(
    DISCOVER_SERVER_NAME,
    lastError ?? new Error('Discovery failed for all transports'),
  );
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  if (!trimmed.includes('://')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}
