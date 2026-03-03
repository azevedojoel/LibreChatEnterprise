import { useState, useRef, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { Button, Spinner, FilterInput, OGDialogTrigger, TooltipAnchor } from '@librechat/client';
import { useLocalize, useMCPServerManager, useHasAccess } from '~/hooks';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import MCPServerDialog from '~/components/SidePanel/MCPBuilder/MCPServerDialog';
import MCPServerList from '~/components/SidePanel/MCPBuilder/MCPServerList';
import CollapsibleWidget from './CollapsibleWidget';

export default function IntegrationsWidget() {
  const localize = useLocalize();
  const { availableMCPServers, isLoading, getServerStatusIconProps, getConfigDialogProps } =
    useMCPServerManager();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const configDialogProps = getConfigDialogProps();

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableMCPServers;
    }
    const query = searchQuery.toLowerCase();
    return availableMCPServers.filter((server) => {
      const displayName = server.config?.title || server.serverName;
      return (
        displayName.toLowerCase().includes(query) || server.serverName.toLowerCase().includes(query)
      );
    });
  }, [availableMCPServers, searchQuery]);

  if (availableMCPServers.length === 0 && !isLoading) {
    return null;
  }

  return (
    <CollapsibleWidget title={localize('com_ui_dashboard_integrations_title')} storageKey="integrations">
      <p className="mb-3 text-xs text-text-secondary">
        {localize('com_ui_dashboard_integrations_subtitle')}
      </p>
      <div className="flex flex-col gap-2">
        {/* Toolbar: Search + Add Button */}
        <div className="flex items-center gap-2">
          <FilterInput
            inputId="dashboard-mcp-filter"
            label={localize('com_ui_filter_mcp_servers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            containerClassName="flex-1"
          />
          {hasCreateAccess && (
            <MCPServerDialog
              open={showDialog}
              onOpenChange={setShowDialog}
              triggerRef={addButtonRef}
            >
              <OGDialogTrigger asChild>
                <TooltipAnchor
                  description={localize('com_ui_add_mcp')}
                  side="bottom"
                  render={
                    <Button
                      ref={addButtonRef}
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0 bg-transparent"
                      onClick={() => setShowDialog(true)}
                      aria-label={localize('com_ui_add_mcp')}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
              </OGDialogTrigger>
            </MCPServerDialog>
          )}
        </div>

        {/* Server Cards List */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-6" aria-label={localize('com_ui_loading')} />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <MCPServerList
              servers={filteredServers}
              getServerStatusIconProps={getServerStatusIconProps}
              isFiltered={searchQuery.trim().length > 0}
            />
          </div>
        )}

        {/* Config Dialog for custom user vars */}
        {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
      </div>
    </CollapsibleWidget>
  );
}
