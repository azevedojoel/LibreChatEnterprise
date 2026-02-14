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

export default function ToolCallInfo({
  input,
  output,
  domain,
  function_name,
  pendingAuth,
  attachments,
}: {
  input: string;
  function_name: string;
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

  let title =
    domain != null && domain
      ? localize('com_assistants_domain_info', { 0: domain })
      : localize('com_assistants_function_use', { 0: function_name });
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

  const handleOpenInArtifact = React.useCallback(() => {
    if (readFileData) {
      openInArtifact({
        content: readFileData.content,
        filename: readFileData.filename,
      });
    }
  }, [readFileData, openInArtifact]);

  return (
    <div className="w-full p-2">
      <div style={{ opacity: 1 }}>
        <div className="mb-2 text-sm font-medium text-text-primary">{title}</div>
        <div>
          <OptimizedCodeBlock text={formatText(input)} maxHeight={250} />
        </div>
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
              <div className="my-2 text-sm font-medium text-text-primary">
                {localize('com_ui_ui_resources')}
              </div>
            )}
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
      </div>
    </div>
  );
}
