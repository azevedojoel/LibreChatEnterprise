import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { PluggableList } from 'unified';
import { code, codeNoExecution, a, p, img } from './MarkdownComponents';
import { CodeBlockProvider, ArtifactProvider, ShowCodeToggleContext } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset } from '~/utils';

const MarkdownLite = memo(
  ({
    content = '',
    codeExecution = true,
    showCodeToggle = false,
  }: {
    content?: string;
    codeExecution?: boolean;
    showCodeToggle?: boolean;
  }) => {
    const rehypePlugins: PluggableList = [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ];

    const markdown = (
      <ReactMarkdown
              remarkPlugins={[
                /** @ts-ignore */
                supersub,
                remarkGfm,
                [remarkMath, { singleDollarTextMath: false }],
              ]}
              /** @ts-ignore */
              rehypePlugins={rehypePlugins}
              components={
                {
                  code: codeExecution ? code : codeNoExecution,
                  a,
                  p,
                  img,
                } as {
                  [nodeType: string]: React.ElementType;
                }
              }
            >
              {content}
            </ReactMarkdown>
    );

    return (
      <MarkdownErrorBoundary content={content} codeExecution={codeExecution}>
        <ArtifactProvider>
          <CodeBlockProvider>
            {showCodeToggle ? (
              <ShowCodeToggleContext.Provider value={true}>{markdown}</ShowCodeToggleContext.Provider>
            ) : (
              markdown
            )}
          </CodeBlockProvider>
        </ArtifactProvider>
      </MarkdownErrorBoundary>
    );
  },
);

export default MarkdownLite;
