import { useState, useCallback } from 'react';
import {
  OGDialog,
  OGDialogTemplate,
  Button,
  Label,
  Input,
  Spinner,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
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

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && !isLoading) {
      onCreate(trimmed);
      setName('');
    }
  }, [name, onCreate, isLoading]);

  const handleClose = useCallback(() => {
    setName('');
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
