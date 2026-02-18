import { Client } from '@hubspot/api-client';

const TOKEN_ENV_KEYS = ['HUBSPOT_ACCESS_TOKEN', 'LIBRECHAT_MCP_OAUTH_ACCESS_TOKEN'] as const;

export function getHubSpotClient(): Client {
  for (const key of TOKEN_ENV_KEYS) {
    const token = process.env[key];
    if (token?.trim()) {
      return new Client({ accessToken: token });
    }
  }
  throw new Error(
    `No HubSpot access token found. Set HUBSPOT_ACCESS_TOKEN or LIBRECHAT_MCP_OAUTH_ACCESS_TOKEN in the environment.`
  );
}
