import { useFormContext } from 'react-hook-form';
import { Search, Link2, TriangleAlert, X } from 'lucide-react';
import { Input, Label, Button, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { isValidUrl, normalizeUrl } from '../utils/urlUtils';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';
import type { MCPServerDiscoverResponse } from 'librechat-data-provider';

interface ConnectionSectionProps {
  isEditMode?: boolean;
  discoveryResult?: MCPServerDiscoverResponse | null;
  discoveryError?: string | null;
  clearDiscoveryError?: () => void;
  isDiscovering?: boolean;
  isConnecting?: boolean;
  onDiscover?: () => void;
  onConnect?: () => void;
}

export default function ConnectionSection({
  isEditMode,
  discoveryResult,
  discoveryError,
  clearDiscoveryError,
  isDiscovering,
  isConnecting,
  onDiscover,
  onConnect,
}: ConnectionSectionProps) {
  const localize = useLocalize();
  const {
    register,
    formState: { errors },
    watch,
  } = useFormContext<MCPServerFormData>();

  const urlValue = watch('url');
  const canDiscover =
    !isEditMode &&
    urlValue &&
    isValidUrl(normalizeUrl(urlValue)) &&
    onDiscover &&
    !isDiscovering;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="url" className="text-sm font-medium">
        {localize('com_ui_mcp_url')}{' '}
        <span aria-hidden="true" className="text-text-secondary">
          *
        </span>
        <span className="sr-only">{localize('com_ui_field_required')}</span>
      </Label>
      <div className="flex gap-2">
        <Input
          id="url"
          type="url"
          autoComplete="off"
          placeholder={localize('com_ui_mcp_server_url_placeholder')}
          aria-invalid={errors.url ? 'true' : 'false'}
          aria-describedby={errors.url ? 'url-error' : undefined}
          {...register('url', {
            required: localize('com_ui_field_required'),
            validate: (value) => {
              const normalized = normalizeUrl(value);
              return isValidUrl(normalized) || localize('com_ui_mcp_invalid_url');
            },
          })}
          className={cn('flex-1', errors.url && 'border-border-destructive')}
        />
        {!isEditMode && onDiscover && (
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={onDiscover}
            disabled={!canDiscover}
            className="shrink-0"
            aria-label={localize('com_ui_mcp_discover')}
          >
            {isDiscovering ? (
              <Spinner className="size-4" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
            <span className="ml-1.5">{localize('com_ui_mcp_discover')}</span>
          </Button>
        )}
      </div>
      {errors.url && (
        <p id="url-error" role="alert" className="text-xs text-text-destructive">
          {errors.url.message}
        </p>
      )}
      {discoveryError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-border-destructive/50 bg-destructive/10 p-2 text-sm text-text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{discoveryError}</span>
          {clearDiscoveryError && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearDiscoveryError}
              aria-label={localize('com_ui_close')}
              className="shrink-0 p-1 text-text-destructive hover:bg-destructive/20"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      {discoveryResult && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-surface-alt p-2 text-sm">
          <span className="text-text-secondary">
            {localize('com_ui_mcp_tools_discovered', {
              0: discoveryResult.tools.length,
            })}
          </span>
          <span className="text-text-tertiary">•</span>
          <span className="text-text-secondary">{discoveryResult.transport}</span>
          {discoveryResult.requiresOAuth && (
            <>
              <span className="text-text-tertiary">•</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary/20 px-1.5 py-0.5 text-xs font-medium text-secondary">
                <Link2 className="size-3" aria-hidden="true" />
                {localize('com_ui_mcp_connect_required')}
              </span>
              {!isEditMode && onConnect && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={onConnect}
                  disabled={isConnecting || isDiscovering}
                  className="ml-auto shrink-0"
                  aria-label={localize('com_ui_mcp_connect')}
                >
                  {isConnecting ? (
                    <Spinner className="size-4" aria-hidden="true" />
                  ) : (
                    localize('com_ui_mcp_connect')
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
