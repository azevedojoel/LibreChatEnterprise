import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Label, useToastContext } from '@librechat/client';
import { useCreateWorkflowMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function CreateWorkflowForm() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const [name, setName] = useState('');
  const createMutation = useCreateWorkflowMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast({ message: localize('com_ui_required'), status: 'error' });
      return;
    }
    createMutation.mutate(
      { name: name.trim(), nodes: [], edges: [] },
      {
        onSuccess: (workflow) => {
          showToast({ message: localize('com_ui_success'), status: 'success' });
          navigate(`/d/workflows/${workflow._id}`);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : localize('com_ui_error');
          showToast({ message: msg || localize('com_ui_error'), status: 'error' });
        },
      },
    );
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-lg border border-border-light bg-surface-secondary p-6 text-text-primary"
      >
        <h2 className="text-lg font-semibold text-text-primary">
          {localize('com_ui_workflows_create')}
        </h2>
        <div>
          <Label htmlFor="workflow-name" className="text-text-primary">
            {localize('com_ui_name')}
          </Label>
          <Input
            id="workflow-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={localize('com_ui_name')}
            className="mt-1 text-text-primary bg-surface-primary placeholder:text-text-tertiary border-border-medium"
            disabled={createMutation.isLoading}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={createMutation.isLoading || !name.trim()}>
            {createMutation.isLoading ? localize('com_ui_loading') : localize('com_ui_create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/d/workflows')}
          >
            {localize('com_ui_cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
