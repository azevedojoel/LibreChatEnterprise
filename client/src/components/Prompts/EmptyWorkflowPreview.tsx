import React from 'react';
import { useLocalize } from '~/hooks';

export default function EmptyWorkflowPreview() {
  const localize = useLocalize();

  return (
    <div className="h-full w-full content-center text-center font-bold text-text-secondary">
      {localize('com_ui_workflows_select_or_create')}
    </div>
  );
}
