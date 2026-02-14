// client/src/hooks/Plugins/useCodeApiKeyForm.ts
/** Code runs locally - stub for backward compatibility with BadgeRowContext, ToolsDropdown, CodeInterpreter */
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ApiKeyFormData } from '~/common';

export default function useCodeApiKeyForm(_options?: {
  onSubmit?: () => void;
  onRevoke?: () => void;
}) {
  const methods = useForm<ApiKeyFormData>();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const badgeTriggerRef = useRef<HTMLInputElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return {
    methods,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey: () => {},
    onSubmit: () => {},
    badgeTriggerRef,
    menuTriggerRef,
  };
}
