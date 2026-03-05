import { memo, useState, useEffect, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import { imageExtRegex, Tools } from 'librechat-data-provider';
import { dataService } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import { useAttachmentLink } from './LogLink';
import useOpenInArtifact, { isPreviewable, inferMimeType } from '~/hooks/Artifacts/useOpenInArtifact';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** Resolve file path - client expects filepath, Responses API may send url */
const getFilePath = (a: Partial<TAttachment> & { url?: string }) =>
  a?.filepath ?? a?.url ?? '';

const FileAttachment = memo(({ attachment }: { attachment: Partial<TAttachment> }) => {
  const localize = useLocalize();
  const [isVisible, setIsVisible] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const file = attachment as TFile & TAttachmentMetadata & { url?: string; skipPreview?: boolean };
  const filepath = getFilePath(attachment as Partial<TAttachment> & { url?: string });
  const openInArtifact = useOpenInArtifact();
  const { handleDownload } = useAttachmentLink({
    href: filepath,
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });
  const extension = attachment.filename?.split('.').pop();
  const filename = attachment.filename ?? '';
  const canOpenInArtifact =
    file?.skipPreview !== true &&
    isPreviewable(filename) &&
    file.file_id &&
    file.user;

  const handleOpenInArtifact = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!file.file_id || !file.user) return;
      setIsOpening(true);
      try {
        const response = await dataService.getFileDownload(file.user, file.file_id);
        const blob = response.data as Blob;
        const content = await blob.text();
        openInArtifact({
          content,
          filename,
          type: inferMimeType(filename),
        });
      } catch (err) {
        console.error('Failed to open file in artifact:', err);
      } finally {
        setIsOpening(false);
      }
    },
    [file.file_id, file.user, filename, openInArtifact],
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!filepath) {
    return null;
  }
  return (
    <div
      className={cn(
        'file-attachment-container',
        'relative',
        'transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
      style={{
        transformOrigin: 'center top',
        willChange: 'opacity, transform',
        WebkitFontSmoothing: 'subpixel-antialiased',
      }}
    >
      <FileContainer
        file={{
          ...attachment,
          filepath: filepath || attachment.filepath,
          progress: 1,
        }}
        onClick={handleDownload}
        overrideType={extension}
        containerClassName="max-w-fit"
        buttonClassName="bg-surface-secondary hover:cursor-pointer hover:bg-surface-hover active:bg-surface-secondary focus:bg-surface-hover hover:border-border-heavy active:border-border-heavy"
      />
      {canOpenInArtifact && (
        <button
          type="button"
          onClick={handleOpenInArtifact}
          disabled={isOpening}
          className="absolute bottom-1 left-1 flex size-6 items-center justify-center rounded-md bg-surface-primary/90 text-text-primary shadow-sm transition-opacity hover:bg-surface-hover disabled:opacity-50"
          title={localize('com_ui_open_in_artifact')}
          aria-label={localize('com_ui_open_in_artifact')}
        >
          {isOpening ? (
            <span className="text-[10px]">...</span>
          ) : (
            <ExternalLink className="size-3" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
});

const ImageAttachment = memo(({ attachment }: { attachment: TAttachment }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { width, height } = attachment as TFile & TAttachmentMetadata;
  const filepath = getFilePath(attachment as Partial<TAttachment> & { url?: string });

  useEffect(() => {
    setIsLoaded(false);
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, [attachment]);

  return (
    <div
      className={cn(
        'image-attachment-container',
        'transition-all duration-500 ease-out',
        isLoaded ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0',
      )}
      style={{
        transformOrigin: 'center top',
        willChange: 'opacity, transform',
        WebkitFontSmoothing: 'subpixel-antialiased',
      }}
    >
      <Image
        altText={attachment.filename || 'attachment image'}
        imagePath={filepath ?? ''}
        height={height ?? 0}
        width={width ?? 0}
        className="mb-4"
      />
    </div>
  );
});

export default function Attachment({ attachment }: { attachment?: TAttachment }) {
  if (!attachment) {
    return null;
  }
  if (attachment.type === Tools.web_search) {
    return null;
  }

  const { width, height } = attachment as TFile & TAttachmentMetadata;
  const filepath = getFilePath(attachment as Partial<TAttachment> & { url?: string });
  const isImage = attachment.filename
    ? imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null
    : false;

  if (isImage) {
    return <ImageAttachment attachment={attachment} />;
  } else if (!filepath) {
    return null;
  }
  return <FileAttachment attachment={attachment} />;
}

export function AttachmentGroup({ attachments }: { attachments?: TAttachment[] }) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const fileAttachments: TAttachment[] = [];
  const imageAttachments: TAttachment[] = [];

  attachments.forEach((attachment) => {
    if (!attachment) return;
    const { width, height } = attachment as TFile & TAttachmentMetadata;
    const filepath = getFilePath(attachment as Partial<TAttachment> & { url?: string });
    const isImage = attachment.filename
      ? imageExtRegex.test(attachment.filename) &&
        width != null &&
        height != null &&
        filepath != null
      : false;

    if (isImage) {
      imageAttachments.push(attachment);
    } else if (attachment.type !== Tools.web_search) {
      fileAttachments.push(attachment);
    }
  });

  return (
    <>
      {fileAttachments.length > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-2.5">
          {fileAttachments.map((attachment, index) => {
            if (!attachment) return null;
            const fp = getFilePath(attachment as Partial<TAttachment> & { url?: string });
            return fp ? (
              <FileAttachment attachment={attachment} key={`file-${index}`} />
            ) : null;
          })}
        </div>
      )}
      {imageAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center">
          {imageAttachments.map((attachment, index) => (
            <ImageAttachment attachment={attachment} key={`image-${index}`} />
          ))}
        </div>
      )}
    </>
  );
}
