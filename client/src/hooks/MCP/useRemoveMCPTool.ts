import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { Constants } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { extractMCPServerFromToolId } from '~/utils/mcp';

/**
 * Hook for removing MCP tools/servers from an agent
 * Provides unified logic for MCPTool, UninitializedMCPTool, and UnconfiguredMCPTool components
 * Note: This only removes the tool from the form, it does not delete associated auth credentials
 */
export function useRemoveMCPTool(options?: { showToast?: boolean }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const shouldShowToast = options?.showToast !== false;

  const removeTool = useCallback(
    (serverName: string) => {
      if (!serverName) {
        return;
      }

      const currentTools = getValues('tools');
      const remainingToolIds =
        currentTools?.filter((currentToolId) => {
          if (!currentToolId) return true;
          if (currentToolId === serverName) return false; // legacy: tool ID is server name
          if (!currentToolId.includes(Constants.mcp_delimiter)) return true;
          const extractedServer = extractMCPServerFromToolId(currentToolId);
          return extractedServer !== serverName;
        }) ?? [];
      setValue('tools', remainingToolIds, { shouldDirty: true });

      if (shouldShowToast) {
        showToast({
          message: localize('com_ui_delete_tool_save_reminder'),
          status: 'warning',
        });
      }
    },
    [getValues, setValue, showToast, localize, shouldShowToast],
  );

  return { removeTool };
}
