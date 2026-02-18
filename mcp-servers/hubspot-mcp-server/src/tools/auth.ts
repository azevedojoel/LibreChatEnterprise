export function registerAuthTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void }
) {
  server.registerTool(
    'hubspot_auth_clear',
    {
      description:
        'Clears the HubSpot authentication hint. Does not revoke the token; LibreChat manages tokens. Use to force re-auth prompt on next use.',
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Auth clear requested. LibreChat will prompt for re-authentication on next HubSpot tool use.',
          },
        ],
      };
    }
  );
}
