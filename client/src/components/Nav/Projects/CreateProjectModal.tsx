import { useState, useCallback } from 'react';
import {
  OGDialog,
  OGDialogTemplate,
  Button,
  Label,
  Input,
  Spinner,
  Checkbox,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetWorkspaceMeQuery } from '~/data-provider';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, sharedWithWorkspace?: boolean) => void;
  isLoading: boolean;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}: CreateProjectModalProps) {
  const localize = useLocalize();
  const [name, setName] = useState('');
  const [sharedWithWorkspace, setSharedWithWorkspace] = useState(false);

  const { data: workspaceMeData } = useGetWorkspaceMeQuery({ enabled: isOpen });
  const showShareCheckbox =
    !!workspaceMeData?.workspace?.id && !!workspaceMeData?.isAdmin;

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && !isLoading) {
      onCreate(trimmed, showShareCheckbox ? sharedWithWorkspace : undefined);
      setName('');
      setSharedWithWorkspace(false);
    }
  }, [name, sharedWithWorkspace, showShareCheckbox, onCreate, isLoading]);

  const handleClose = useCallback(() => {
    setName('');
    setSharedWithWorkspace(false);
    onClose();
  }, [onClose]);

  return (
    <OGDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <OGDialogTemplate
        title={localize('com_ui_new_project')}
        className="w-11/12 md:max-w-lg"
        showCloseButton={false}
        main={
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="text-sm font-medium text-text-primary">
                {localize('com_ui_name')}
              </Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSubmit())}
                placeholder={localize('com_ui_new_project')}
                disabled={isLoading}
                autoFocus
              />
            </div>
            {showShareCheckbox && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="project-share-workspace"
                  checked={sharedWithWorkspace}
                  onCheckedChange={(checked) => setSharedWithWorkspace(checked === true)}
                  className="relative float-left inline-flex h-4 w-4 cursor-pointer"
                  aria-label={localize('com_ui_project_share_with_workspace')}
                />
                <Label
                  htmlFor="project-share-workspace"
                  className="text-sm text-text-primary cursor-pointer"
                >
                  {localize('com_ui_project_share_with_workspace')}
                </Label>
              </div>
            )}
          </div>
        }
        buttons={
          <Button
            type="button"
            variant="submit"
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? <Spinner className="size-4" /> : localize('com_ui_create')}
          </Button>
        }
      />
    </OGDialog>
  );
}
