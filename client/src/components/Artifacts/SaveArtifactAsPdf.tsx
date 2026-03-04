import React, { useState } from 'react';
import { FileText, CircleCheckBig, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Artifact } from '~/common';
import { Button } from '@librechat/client';
import { useRecoilValue } from 'recoil';
import { useCodeState } from '~/Providers/EditorContext';
import { useLocalize } from '~/hooks';
import { dataService, QueryKeys, FileSources } from 'librechat-data-provider';
import { useFileDownload } from '~/data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import store from '~/store';

const HTML_ARTIFACT_TYPES = ['text/html', 'application/vnd.code-html'];

const SaveArtifactAsPdf = ({ artifact }: { artifact: Artifact }) => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const user = useRecoilValue(store.user);
  const { currentCode } = useCodeState();
  const [savedFile, setSavedFile] = useState<{
    file_id: string;
    filepath: string;
    filename: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = currentCode ?? artifact.content ?? '';
  const isHtmlType = artifact.type && HTML_ARTIFACT_TYPES.includes(artifact.type);

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', savedFile?.file_id);

  const handleSaveAsPdf = async () => {
    if (!content) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const baseName = artifact.title || 'document';
      const filename = `${baseName.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;
      const result = await dataService.saveArtifactAsPdf(content, filename);
      setSavedFile(result);
      await queryClient.invalidateQueries([QueryKeys.files]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save PDF');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!savedFile) return;
    try {
      const result = await downloadFile();
      if (result.data) {
        const link = document.createElement('a');
        link.href = result.data;
        link.setAttribute('download', savedFile.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(result.data);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  if (!isHtmlType) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {savedFile ? (
        <div className="flex items-center gap-2">
          <FileContainer
            file={{
              file_id: savedFile.file_id,
              filename: savedFile.filename,
              filepath: savedFile.filepath,
              type: 'application/pdf',
              user: user?.id,
              source: FileSources.local,
            }}
            onClick={handleDownload}
            overrideType="pdf"
            containerClassName="max-w-fit"
            buttonClassName="bg-surface-secondary hover:cursor-pointer hover:bg-surface-hover"
          />
          <CircleCheckBig size={16} className="text-green-500" aria-hidden="true" />
        </div>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSaveAsPdf}
          disabled={isSaving || !content}
          aria-label={localize('com_ui_save_as_pdf')}
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <FileText size={16} aria-hidden="true" />
          )}
        </Button>
      )}
      {error && (
        <span className="text-xs text-red-500" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default SaveArtifactAsPdf;
