/**
 * LangChain tool that runs code locally. Same interface as createCodeExecutionTool
 * so it works with processLocalCodeOutput and existing callbacks.
 */
const path = require('path');
const { tool } = require('@langchain/core/tools');
const {
  runCodeLocally,
  imageExtRegex,
  getSessionBaseDir,
  injectAgentFiles,
} = require('./executor');

const imageMessage = 'Image is already displayed to the user';
const otherMessage = 'File is already downloaded by the user';
const accessMessage =
  'Note: Files from previous executions are automatically available and can be modified.';
const emptyOutputMessage =
  "stdout: Empty. Ensure you're writing output explicitly.\n";

const CodeExecutionToolName = 'execute_code';
const CodeExecutionToolDescription = `
Runs Python code locally and returns stdout/stderr output. Each execution is isolated and independent.
- Use print() for all outputs. Matplotlib: use plt.savefig() to save plots.
- Generated files are automatically delivered; **DO NOT** provide download links.
- Supports Python only. No network access.
`.trim();

const CodeExecutionToolSchema = {
  type: 'object',
  properties: {
    lang: {
      type: 'string',
      enum: ['py'],
      description: 'The programming language. Local execution supports Python only.',
    },
    code: {
      type: 'string',
      description: `The complete, self-contained Python code to execute.
- Use print() for all outputs.
- Matplotlib: Use plt.savefig() to save plots as files in the output directory.`,
    },
    args: {
      type: 'array',
      items: { type: 'string' },
      description: 'Additional arguments to execute the code with.',
    },
  },
  required: ['lang', 'code'],
};

/**
 * @param {object} [params] - Optional params for compatibility with createCodeExecutionTool signature
 * @param {Array<{ filepath?: string; filename: string }>} [params.files] - Agent-uploaded files to copy into workspace
 * @returns {import('@langchain/core/tools').DynamicStructuredTool}
 */
function createLocalCodeExecutionTool(params = {}) {
  const agentFiles = params.files ?? [];
  return tool(
    async (rawInput, config) => {
      const { lang, code, args } = rawInput;
      const toolCall = config?.toolCall ?? config?.configurable?.toolCall;
      const threadId = config?.configurable?.thread_id;
      const session_id =
        toolCall?.session_id ?? (threadId ? `conv_${threadId}` : undefined);
      const resolvedSessionId = session_id ?? `local_${Date.now().toString(36)}`;
      const sessionDir = path.join(getSessionBaseDir(), resolvedSessionId);
      const outputDir = path.join(sessionDir, 'output');
      await injectAgentFiles(outputDir, agentFiles);
      try {
        const result = await runCodeLocally({
          lang,
          code,
          args: args ?? [],
          session_id: session_id ?? resolvedSessionId,
        });
        let formattedOutput = '';
        if (result.stdout) {
          formattedOutput += `stdout:\n${result.stdout}\n`;
        } else {
          formattedOutput += emptyOutputMessage;
        }
        if (result.stderr) {
          formattedOutput += `stderr:\n${result.stderr}\n`;
        }
        if (result.files && result.files.length > 0) {
          formattedOutput += 'Generated files:\n';
          for (let i = 0; i < result.files.length; i++) {
            const f = result.files[i];
            const isImage = imageExtRegex.test(f.name);
            formattedOutput += `- /mnt/data/${f.name} | ${isImage ? imageMessage : otherMessage}`;
            if (i < result.files.length - 1) {
              formattedOutput += result.files.length <= 3 ? ', ' : ',\n';
            }
          }
          formattedOutput += `\n\n${accessMessage}`;
        }
        return [
          formattedOutput.trim(),
          {
            session_id: result.session_id,
            files: result.files || [],
          },
        ];
      } catch (err) {
        throw new Error(
          `Execution error:\n\n${err?.message ?? String(err)}`
        );
      }
    },
    {
      name: CodeExecutionToolName,
      description: CodeExecutionToolDescription,
      schema: CodeExecutionToolSchema,
      responseFormat: 'content_and_artifact',
    }
  );
}

module.exports = { createLocalCodeExecutionTool };
