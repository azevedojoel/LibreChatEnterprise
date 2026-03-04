import { useCallback, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { mergeFileConfig, getEndpointFileConfig } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { useUploadFileMutation } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { useGetFileConfig, useGetEndpointsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { validateFiles, getDefaultEndpoint } from '~/utils';

export function useMyFilesUpload() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpoint =
    conversation?.endpoint ??
    getDefaultEndpoint({ convoSetup: {}, endpointsConfig: endpointsConfig ?? {} });
  const endpointType = conversation?.endpointType ?? undefined;

  const uploadFile = useUploadFileMutation({
    onSuccess: () => {
      setIsUploading(false);
      showToast({
        message: localize('com_ui_upload_success'),
        status: 'success',
      });
    },
    onError: (error: unknown) => {
      setIsUploading(false);
      showToast({
        message: (error as { message?: string })?.message ?? localize('com_ui_error'),
        status: 'error',
      });
    },
    onMutate: () => setIsUploading(true),
  });

  const setError = useCallback(
    (errorKey: string) => {
      showToast({
        message: localize(errorKey as Parameters<typeof localize>[0]) ?? errorKey,
        status: 'error',
      });
    },
    [localize, showToast],
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!endpoint || !fileConfig) {
        return;
      }

      const endpointFileConfig = getEndpointFileConfig({
        endpoint,
        fileConfig,
        endpointType,
      });

      const filesAreValid = validateFiles({
        files: new Map(),
        fileList: [file],
        setError,
        fileConfig,
        endpointFileConfig,
      });

      if (!filesAreValid) {
        return;
      }

      const file_id = v4();
      const formData = new FormData();
      formData.append('endpoint', endpoint);
      formData.append('endpointType', endpointType ?? '');
      formData.append('file', file, encodeURIComponent(file.name || 'File'));
      formData.append('file_id', file_id);
      formData.append('message_file', 'true');

      uploadFile.mutate(formData);
    },
    [endpoint, endpointType, fileConfig, setError, uploadFile],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
      event.target.value = '';
    },
    [handleFileUpload],
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    fileInputRef,
    isUploading,
    handleFileChange,
    triggerFileInput,
  };
}
