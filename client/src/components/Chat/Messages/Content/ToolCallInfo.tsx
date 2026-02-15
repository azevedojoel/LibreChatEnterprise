import React, { useMemo } from 'react';
import { Button } from '@librechat/client';
import { ExternalLink } from 'lucide-react';
import { useLocalize } from '~/hooks';
import useOpenInArtifact from '~/hooks/Artifacts/useOpenInArtifact';
import { Tools } from 'librechat-data-provider';
import { UIResourceRenderer } from '@mcp-ui/client';
import UIResourceCarousel from './UIResourceCarousel';
import type { TAttachment, UIResource } from 'librechat-data-provider';

function OptimizedCodeBlock({ text, maxHeight = 320 }: { text: string; maxHeight?: number }) {
  return (
    <div
      className="rounded-lg bg-surface-tertiary p-2 text-xs text-text-primary"
      style={{
        position: 'relative',
        maxHeight,
        overflow: 'auto',
      }}
    >
      <pre className="m-0 whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word' }}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function FileListRow({
  filename,
  path,
  count,
}: {
  filename: string;
  path: string;
  count?: number;
}) {
  const ext = filename.includes('.') ? (filename.split('.').pop()?.toLowerCase() ?? '') : '';
  const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '') : path.replace(/\\[^\\]+$/, '');
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded bg-surface-tertiary px-1 font-mono text-[10px] font-medium text-text-secondary">
        {ext || '?'}
      </span>
      <span className="min-w-0 shrink-0 truncate font-medium text-text-primary">{filename}</span>
      {dir ? (
        <span className="min-w-0 truncate text-text-secondary" title={dir}>
          {dir}
        </span>
      ) : null}
      {count != null && (
        <span className="ml-auto shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-text-secondary">
          {count}
        </span>
      )}
    </div>
  );
}

export default function ToolCallInfo({
  input,
  output,
  domain,
  function_name,
  displayName,
  pendingAuth,
  attachments,
}: {
  input: string;
  function_name: string;
  displayName?: string;
  output?: string | null;
  domain?: string;
  pendingAuth?: boolean;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const formatText = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  const nameForTitle = displayName ?? function_name;
  const isGreppedOrGlobbed =
    function_name === Tools.search_files || function_name === Tools.glob_files;
  let title: string;
  if (domain != null && domain) {
    title = localize('com_assistants_domain_info', { 0: domain });
  } else if (isGreppedOrGlobbed) {
    title = nameForTitle;
  } else {
    title = localize('com_assistants_function_use', { 0: nameForTitle });
  }
  if (pendingAuth === true) {
    title =
      domain != null && domain
        ? localize('com_assistants_action_attempt', { 0: domain })
        : localize('com_assistants_attempt_info');
  }

  const uiResources: UIResource[] =
    attachments
      ?.filter((attachment) => attachment.type === Tools.ui_resources)
      .flatMap((attachment) => {
        return attachment[Tools.ui_resources] as UIResource[];
      }) ?? [];

  const openInArtifact = useOpenInArtifact();

  const readFileData = useMemo(() => {
    if (function_name !== Tools.read_file || !output) {
      return null;
    }
    try {
      const parsed = JSON.parse(output) as { content?: string; error?: string };
      if (typeof parsed.content === 'string' && parsed.content.length > 0) {
        let filename = 'file';
        try {
          const inputParsed = JSON.parse(input) as { relativePath?: string };
          if (typeof inputParsed.relativePath === 'string') {
            filename = inputParsed.relativePath.split(/[/\\]/).pop() ?? filename;
          }
        } catch {
          // use default filename
        }
        return { content: parsed.content, filename };
      }
    } catch {
      // output is not valid JSON
    }
    return null;
  }, [function_name, output, input]);

  const searchFilesData = useMemo(() => {
    if (function_name !== Tools.search_files || !output) {
      return null;
    }
    if (output.startsWith('Error:') || output === 'No matches found.') {
      return null;
    }
    const countByPath = new Map<string, number>();
    for (const line of output.split('\n')) {
      const match = line.match(/^(.+):\d+:/);
      if (match) {
        const path = match[1];
        countByPath.set(path, (countByPath.get(path) ?? 0) + 1);
      }
    }
    return Array.from(countByPath.entries())
      .map(([path, count]) => ({
        path,
        filename: path.split(/[/\\]/).pop() ?? path,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [function_name, output]);

  const globFilesData = useMemo(() => {
    if (function_name !== Tools.glob_files || !output) {
      return null;
    }
    if (output.startsWith('Error:') || output === 'No files found.') {
      return null;
    }
    return output
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((path) => ({
        path,
        filename: path.split(/[/\\]/).pop() ?? path,
      }));
  }, [function_name, output]);

  const handleOpenInArtifact = React.useCallback(() => {
    if (readFileData) {
      openInArtifact({
        content: readFileData.content,
        filename: readFileData.filename,
      });
    }
  }, [readFileData, openInArtifact]);

  const isCompactFileList =
    (searchFilesData && searchFilesData.length > 0) || (globFilesData && globFilesData.length > 0);

  return (
    <div className="w-full p-2">
      <div style={{ opacity: 1 }}>
        <div className="mb-2 text-sm font-medium text-text-primary">{title}</div>
        {!isCompactFileList && (
          <div>
            <OptimizedCodeBlock text={formatText(input)} maxHeight={250} />
          </div>
        )}
        {isCompactFileList ? (
          <div className="space-y-0.5">
            {searchFilesData?.map(({ path, filename, count }) => (
              <FileListRow key={path} filename={filename} path={path} count={count} />
            ))}
            {globFilesData?.map(({ path, filename }) => (
              <FileListRow key={path} filename={filename} path={path} />
            ))}
          </div>
        ) : (
          <>
            {output && (
              <>
                <div className="my-2 text-sm font-medium text-text-primary">
                  {localize('com_ui_result')}
                </div>
                <div>
                  <OptimizedCodeBlock text={formatText(output)} maxHeight={250} />
                </div>
                {readFileData && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenInArtifact}
                      className="gap-1.5"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      {localize('com_ui_open_in_artifact')}
                    </Button>
                  </div>
                )}
                {uiResources.length > 0 && (
                  <>
                    <div className="my-2 text-sm font-medium text-text-primary">
                      {localize('com_ui_ui_resources')}
                    </div>
                    <div>
                      {uiResources.length > 1 && <UIResourceCarousel uiResources={uiResources} />}
                      {uiResources.length === 1 && (
                        <UIResourceRenderer
                          resource={uiResources[0]}
                          onUIAction={async (result) => {
                            console.log('Action:', result);
                          }}
                          htmlProps={{
                            autoResizeIframe: { width: true, height: true },
                          }}
                        />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
