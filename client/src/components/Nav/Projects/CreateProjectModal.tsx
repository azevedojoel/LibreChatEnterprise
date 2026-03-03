import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@librechat/client';
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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed && !isLoading) {
        onCreate(trimmed);
        setName('');
      }
    },
    [name, onCreate, isLoading],
  );

  const handleClose = useCallback(() => {
    setName('');
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{localize('com_ui_new_project')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="project-name"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              {localize('com_ui_name')}
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={localize('com_ui_new_project')}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-text-primary placeholder:text-text-secondary focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-border-medium dark:focus:border-white dark:focus:ring-white"
              autoFocus
              disabled={isLoading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-border-medium px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
            >
              {localize('com_ui_cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              {isLoading ? localize('com_ui_loading') : localize('com_ui_create')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
