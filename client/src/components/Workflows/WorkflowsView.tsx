import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { WorkflowEditorProvider } from '~/Providers/WorkflowEditorContext';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import WorkflowSidePanel from './WorkflowSidePanel';
import { useHasAccess, useLocalize } from '~/hooks';
import { useMediaQuery } from '@librechat/client';
import { cn } from '~/utils';

export default function WorkflowsView() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const localize = useLocalize();

  const isDetailView = useMemo(
    () => !!(params.workflowId || params['*'] === 'new'),
    [params],
  );
  const isSmallerScreen = useMediaQuery('(max-width: 768px)');
  const [panelVisible, setPanelVisible] = useState(!isSmallerScreen);
  const openPanelRef = useRef<HTMLButtonElement>(null);
  const closePanelRef = useRef<HTMLButtonElement>(null);

  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccess = hasAccessToPrompts && hasAccessToAgents;

  const { data: startupConfig } = useGetStartupConfig();
  const workflowsEnabled = (startupConfig?.interface?.workflows ?? true) !== false;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccess) {
      timeoutId = setTimeout(() => {
        navigate('/c/new');
      }, 1000);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasAccess, navigate]);

  useEffect(() => {
    if (!workflowsEnabled && location.pathname.includes('/workflows')) {
      navigate('/d/prompts', { replace: true });
    }
  }, [workflowsEnabled, location.pathname, navigate]);

  const togglePanel = useCallback(() => {
    setPanelVisible((prev) => {
      const newValue = !prev;
      requestAnimationFrame(() => {
        if (newValue) {
          closePanelRef?.current?.focus();
        } else {
          openPanelRef?.current?.focus();
        }
      });
      return newValue;
    });
  }, []);

  useEffect(() => {
    if (isSmallerScreen && isDetailView) {
      setPanelVisible(false);
    }
  }, [isSmallerScreen, isDetailView]);

  if (!hasAccess) {
    return null;
  }

  return (
    <WorkflowEditorProvider>
      <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
        <DashBreadcrumb
        showToggle={isSmallerScreen && isDetailView}
        onToggle={togglePanel}
        openPanelRef={openPanelRef}
      />
      <div className="flex w-full flex-grow flex-row overflow-hidden">
        {isSmallerScreen && panelVisible && isDetailView && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={togglePanel}
            role="button"
            tabIndex={0}
            aria-label={localize('com_nav_toggle_sidebar')}
          />
        )}

        {(!isSmallerScreen || !isDetailView || panelVisible) && (
          <div
            className={cn(
              'transition-transform duration-300 ease-in-out',
              isSmallerScreen && isDetailView
                ? 'fixed left-0 top-0 z-50 h-full w-[320px] bg-surface-primary'
                : 'flex',
            )}
          >
            <WorkflowSidePanel
              closePanelRef={closePanelRef}
              onClose={isSmallerScreen && isDetailView ? togglePanel : undefined}
            />
          </div>
        )}

        <div
          className={cn(
            'scrollbar-gutter-stable w-full overflow-y-auto lg:w-3/4 xl:w-3/4',
            isDetailView ? 'block' : 'hidden md:block',
          )}
        >
          <Outlet />
        </div>
      </div>
    </div>
    </WorkflowEditorProvider>
  );
}
