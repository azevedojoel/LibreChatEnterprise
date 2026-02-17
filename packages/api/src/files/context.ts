import { logger } from '@librechat/data-schemas';
import { FileSources, mergeFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';

/**
 * Extracts text context from attachments and returns formatted text.
 * This handles text that was already extracted from files (OCR, transcriptions, document text, etc.)
 * @param params - The parameters object
 * @param params.attachments - Array of file attachments
 * @param params.req - Express request object for config access
 * @param params.tokenCountFn - Function to count tokens in text
 * @returns The formatted file context text, or undefined if no text found
 */
export async function extractFileContext({
  attachments,
  req,
  tokenCountFn,
}: {
  attachments: IMongoFile[];
  req?: ServerRequest;
  tokenCountFn: (text: string) => number;
}): Promise<string | undefined> {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const fileTokenLimit = req?.body?.fileTokenLimit ?? fileConfig.fileTokenLimit;

  let resultText = '';

  if (fileTokenLimit) {
    for (const file of attachments) {
      const source = file.source ?? FileSources.local;
      if (source === FileSources.text && file.text) {
        const { text: limitedText, wasTruncated } = await processTextWithTokenLimit({
          text: file.text,
          tokenLimit: fileTokenLimit,
          tokenCountFn,
        });

        if (wasTruncated) {
          logger.debug(
            `[extractFileContext] Text content truncated for file: ${file.filename} due to token limits`,
          );
        }

        resultText += `${!resultText ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${limitedText}\n`;
      }
    }
  }

  if (resultText) {
    resultText += '\n```';
    return resultText;
  }

  /** Fallback: Files with fileIdentifier (execute_code) have no extractable text but need context */
  const executeCodeFiles = attachments.filter(
    (f) => f.filename && f.metadata?.fileIdentifier != null,
  );
  if (executeCodeFiles.length > 0) {
    const filenames = executeCodeFiles.map((f) => f.filename).join(', ');
    return `The user has attached the following file(s) for code execution: ${filenames}\nThese files are pre-loaded in your working directory. Use the filename(s) directly in your Python code (e.g., pd.read_csv('${executeCodeFiles[0]?.filename ?? 'file.csv'}')).`;
  }

  return undefined;
}
