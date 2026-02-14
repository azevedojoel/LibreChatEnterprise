import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import type { Artifact } from '~/common';
import store from '~/store';

/**
 * Maps file extensions to MIME types supported by the artifact viewer.
 * Uses types from utils/artifacts.ts for proper Sandpack template selection.
 */
function inferMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    tsx: 'application/vnd.react',
    jsx: 'application/vnd.react',
    md: 'text/markdown',
    mdx: 'text/markdown',
    mermaid: 'application/vnd.mermaid',
    mmd: 'application/vnd.mermaid',
  };
  return mimeMap[ext] ?? 'text/plain';
}

export interface OpenInArtifactParams {
  content: string;
  filename: string;
  type?: string;
}

/**
 * Hook that provides a function to open file content in the artifact viewer.
 * Used when clicking "Open in Artifact" on read_file tool outputs.
 */
export default function useOpenInArtifact() {
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const setArtifactsVisibility = useSetRecoilState(store.artifactsVisibility);

  return useCallback(
    ({ content, filename, type }: OpenInArtifactParams) => {
      const mimeType = type ?? inferMimeType(filename);
      const id = `workspace_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}_${Date.now()}`;

      const artifact: Artifact = {
        id,
        content,
        title: filename,
        type: mimeType,
        lastUpdateTime: Date.now(),
      };

      setArtifacts((prev) => ({
        ...prev,
        [id]: artifact,
      }));
      setCurrentArtifactId(id);
      setArtifactsVisibility(true);
    },
    [setArtifacts, setCurrentArtifactId, setArtifactsVisibility],
  );
}
