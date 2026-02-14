import React, { useMemo, useEffect } from 'react';
import { alternateName, SystemRoles } from 'librechat-data-provider';
import { Switch, useToastContext } from '@librechat/client';
import { useLocalize, useAuthContext } from '~/hooks';
import {
  useGetAdminEndpointsForSettingsQuery,
  useGetAdminInterfaceSettingsQuery,
  useUpdateAdminInterfaceSettingsMutation,
} from '~/data-provider';
import { mapEndpoints } from '~/utils';

export default function ProviderVisibilitySettings() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  const { data: endpointsConfig, isLoading: isLoadingEndpoints } =
    useGetAdminEndpointsForSettingsQuery({
      enabled: user?.role === SystemRoles.ADMIN,
    });

  const { data: adminSettings, isLoading: isLoadingSettings } = useGetAdminInterfaceSettingsQuery({
    enabled: user?.role === SystemRoles.ADMIN,
  });

  const updateMutation = useUpdateAdminInterfaceSettingsMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_saved'), status: 'success' });
    },
    onError: () => {
      showToast({ message: localize('com_ui_error_save_admin_settings'), status: 'error' });
    },
  });

  const endpointKeys = useMemo(
    () => (endpointsConfig ? mapEndpoints(endpointsConfig) : []),
    [endpointsConfig],
  );

  const [visibleSet, setVisibleSet] = React.useState<Set<string>>(new Set());

  useEffect(() => {
    if (adminSettings?.visibleEndpoints && adminSettings.visibleEndpoints.length > 0) {
      setVisibleSet(new Set(adminSettings.visibleEndpoints));
    } else if (endpointKeys.length > 0) {
      setVisibleSet(new Set(endpointKeys));
    }
  }, [adminSettings?.visibleEndpoints, endpointKeys]);

  const handleToggle = (endpoint: string, checked: boolean) => {
    setVisibleSet((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(endpoint);
      } else {
        next.delete(endpoint);
      }
      return next;
    });
  };

  const handleSave = () => {
    const visibleEndpoints = endpointKeys.filter((ep) => visibleSet.has(ep));
    updateMutation.mutate({ visibleEndpoints });
  };

  const hasChanges = useMemo(() => {
    const current = new Set(adminSettings?.visibleEndpoints ?? endpointKeys);
    if (visibleSet.size !== current.size) return true;
    for (const ep of visibleSet) {
      if (!current.has(ep)) return true;
    }
    for (const ep of current) {
      if (!visibleSet.has(ep)) return true;
    }
    return false;
  }, [adminSettings?.visibleEndpoints, endpointKeys, visibleSet]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  if (isLoadingEndpoints || isLoadingSettings || endpointKeys.length === 0) {
    return null;
  }

  return (
    <div className="pb-3">
      <div className="mb-2 text-sm font-medium">{localize('com_nav_provider_visibility')}</div>
      <p className="mb-3 text-xs text-text-secondary">
        {localize('com_nav_provider_visibility_description')}
      </p>
      <div className="flex flex-col gap-2">
        {endpointKeys.map((endpoint) => (
          <div key={endpoint} className="flex items-center justify-between">
            <span>
              {alternateName[endpoint as keyof typeof alternateName] ?? endpoint}
            </span>
            <Switch
              checked={visibleSet.has(endpoint)}
              onCheckedChange={(checked) => handleToggle(endpoint, !!checked)}
              aria-label={alternateName[endpoint as keyof typeof alternateName] ?? endpoint}
            />
          </div>
        ))}
      </div>
      {hasChanges && (
        <button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isLoading}
          className="mt-3 rounded-md border border-transparent bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {updateMutation.isLoading ? localize('com_ui_loading') : localize('com_ui_save')}
        </button>
      )}
    </div>
  );
}
