import React, { useMemo } from 'react';
import { FolderInput, FolderX, ArrowRight } from 'lucide-react';

interface ProjectSwitchProps {
  args: string | Record<string, unknown>;
  output?: string | null;
}

const ProjectSwitch: React.FC<ProjectSwitchProps> = ({ args: _args = '', output }) => {
  const args = useMemo(() => {
    if (typeof _args === 'string') {
      try {
        return JSON.parse(_args || '{}') as { projectId?: string | null };
      } catch {
        return {};
      }
    }
    return (_args || {}) as { projectId?: string | null };
  }, [_args]);

  const parsed = useMemo(() => {
    if (!output?.trim()) return null;
    try {
      return JSON.parse(output) as {
        success?: boolean;
        error?: string;
        message?: string;
        project?: { name?: string; _id?: string };
      };
    } catch {
      return null;
    }
  }, [output]);

  const isCleared = args.projectId == null || args.projectId === '';
  const hasError = parsed?.error ?? false;
  const projectName = parsed?.project?.name ?? null;
  const isLoading = !output?.trim();

  if (hasError) {
    return (
      <div className="my-3 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5">
        <FolderX className="h-5 w-5 shrink-0 text-red-400" strokeWidth={1.5} />
        <span className="text-sm text-red-400">{parsed?.error ?? 'Failed to switch project'}</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="my-3 flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary/30 px-3 py-2.5">
        <div className="flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-lg bg-surface-secondary">
          <FolderInput className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
        </div>
        <span className="text-sm text-text-tertiary">
          {isCleared ? 'Clearing project…' : 'Switching project…'}
        </span>
      </div>
    );
  }

  if (isCleared || !projectName) {
    return (
      <div className="my-3 flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary/50 px-3 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-primary">
          <FolderX className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-primary">Project cleared</span>
          <span className="text-xs text-text-tertiary">Conversation is no longer linked to a project</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary/50 px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-primary">
        <FolderInput className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.5} />
      </div>
      <ArrowRight className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={2.5} />
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-text-tertiary">Switched to</span>
        <span className="truncate text-sm font-semibold text-text-primary">
          {projectName}
        </span>
      </div>
    </div>
  );
};

export default ProjectSwitch;
