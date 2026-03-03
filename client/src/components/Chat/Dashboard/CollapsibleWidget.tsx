import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  useMediaQuery,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

const STORAGE_PREFIX = 'dashboard-widget-';

function getStoredOpen(storageKey: string | undefined): boolean | null {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (stored === null) return null;
    return stored === 'true';
  } catch {
    return null;
  }
}

type CollapsibleWidgetProps = {
  title: string;
  children: React.ReactNode;
  storageKey?: string;
};

export default function CollapsibleWidget({ title, children, storageKey }: CollapsibleWidgetProps) {
  const localize = useLocalize();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const defaultOpen = !isMobile;

  const [open, setOpen] = useState<boolean>(() => {
    const stored = getStoredOpen(storageKey);
    return stored !== null ? stored : defaultOpen;
  });

  const handleOpenChange = useCallback(
    (value: boolean) => {
      setOpen(value);
      if (storageKey && typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_PREFIX + storageKey, String(value));
        } catch {
          // ignore
        }
      }
    },
    [storageKey],
  );

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <div className="rounded-2xl border border-border-medium bg-white shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 dark:bg-surface-primary">
        <CollapsibleTrigger
          className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-secondary/50 rounded-t-2xl data-[state=open]:rounded-b-none"
          aria-label={open ? localize('com_ui_collapse') : localize('com_ui_expand')}
        >
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 pt-0">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
