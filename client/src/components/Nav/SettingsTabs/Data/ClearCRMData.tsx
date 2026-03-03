import React, { useState } from 'react';
import { useClearCRMDataMutation } from 'librechat-data-provider/react-query';
import {
  OGDialogTemplate,
  Label,
  Button,
  OGDialog,
  OGDialogTrigger,
  Spinner,
} from '@librechat/client';
import { useAuthContext, useLocalize } from '~/hooks';

export const ClearCRMData = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);
  const clearCRMMutation = useClearCRMDataMutation();

  const projectId = user?.projectId?.toString?.() ?? user?.projectId;
  if (!projectId) {
    return null;
  }

  const clearCRM = () => {
    clearCRMMutation.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <div className="flex items-center justify-between">
      <Label id="clear-crm-data-label">{localize('com_nav_clear_crm_data')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button
            aria-labelledby="clear-crm-data-label"
            variant="destructive"
            onClick={() => setOpen(true)}
          >
            {localize('com_ui_delete')}
          </Button>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_nav_clear_crm_data_confirm')}
          className="max-w-[450px]"
          main={
            <Label className="break-words">
              {localize('com_nav_clear_crm_data_warning')}
            </Label>
          }
          selection={{
            selectHandler: clearCRM,
            selectClasses:
              'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
            selectText: clearCRMMutation.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
};
