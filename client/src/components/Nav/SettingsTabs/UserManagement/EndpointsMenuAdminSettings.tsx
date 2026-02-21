import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { Button, useToastContext } from '@librechat/client';
import { ShieldEllipsis } from 'lucide-react';
import { AdminSettingsDialog } from '~/components/ui';
import { useUpdateEndpointsMenuPermissionsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { PermissionConfig } from '~/components/ui';

const permissions: PermissionConfig[] = [
  { permission: Permissions.USE, labelKey: 'com_ui_endpoints_menu_allow_use' },
];

const EndpointsMenuAdminSettings = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useUpdateEndpointsMenuPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  return (
    <AdminSettingsDialog
      permissionType={PermissionTypes.ENDPOINTS_MENU}
      sectionKey="com_ui_endpoints_menu"
      permissions={permissions}
      menuId="endpoints-menu-role-dropdown"
      mutation={mutation}
      trigger={
        <Button
          size="sm"
          variant="outline"
          className="gap-2 border-border-light font-medium"
          aria-label={localize('com_ui_admin_settings')}
        >
          <ShieldEllipsis className="size-5" aria-hidden="true" />
          {localize('com_ui_endpoints_menu_settings')}
        </Button>
      }
    />
  );
};

export default EndpointsMenuAdminSettings;
