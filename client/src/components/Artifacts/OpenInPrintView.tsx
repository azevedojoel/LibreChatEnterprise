import React from 'react';
import { Printer } from 'lucide-react';
import type { Artifact } from '~/common';
import { Button } from '@librechat/client';
import { useCodeState } from '~/Providers/EditorContext';
import { useLocalize } from '~/hooks';

const HTML_ARTIFACT_TYPES = ['text/html', 'application/vnd.code-html'];

const OpenInPrintView = ({ artifact }: { artifact: Artifact }) => {
  const localize = useLocalize();
  const { currentCode } = useCodeState();
  const content = currentCode ?? artifact.content ?? '';
  const isHtmlType = artifact.type && HTML_ARTIFACT_TYPES.includes(artifact.type);

  const handleOpenInPrintView = () => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (!isHtmlType) {
    return null;
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleOpenInPrintView}
      disabled={!content}
      aria-label={localize('com_ui_open_print_view')}
    >
      <Printer size={16} aria-hidden="true" />
    </Button>
  );
};

export default OpenInPrintView;
