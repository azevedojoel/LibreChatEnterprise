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
const { getWorkspaceSessionId } = require('./workspaceKey');

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
- Matplotlib: Use plt.savefig() to save plots as files in the working directory.`,
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
 * @param {string} [params.agentId] - Agent ID for agent-user workspace scope (files persist across conversations)
 * @param {string} [params.user_id] - User ID for agent-user workspace scope
 * @param {Array<{ filepath?: string; filename: string; source?: string }>} [params.files] - Agent-uploaded files to copy into workspace
 * @param {import('express').Request} [params.req] - Request object for resolving file paths (required for injected files)
 * @returns {import('@langchain/core/tools').DynamicStructuredTool}
 */
function createLocalCodeExecutionTool(params = {}) {
  const agentFiles = params.files ?? [];
  const req = params.req;
  const agentId = params.agentId;
  const userId = params.user_id;
  return tool(
    async (rawInput, config) => {
      const { lang, code, args } = rawInput;
      const toolCall = config?.toolCall ?? config?.configurable?.toolCall;
      const configurable = config?.configurable ?? {};
      const threadId = configurable.thread_id;
      const emitCodeOutputChunk = configurable.emitCodeOutputChunk;
      const toolCallId = toolCall?.id;
      const resolvedSessionId = getWorkspaceSessionId({
        agentId,
        userId,
        conversationId: threadId,
      });
      const sessionDir = path.join(getSessionBaseDir(), resolvedSessionId);
      await injectAgentFiles(sessionDir, agentFiles, req);
      const onOutput =
        typeof emitCodeOutputChunk === 'function' && toolCallId
          ? ({ source, chunk }) => emitCodeOutputChunk(toolCallId, chunk, source)
          : undefined;
      try {
        const result = await runCodeLocally({
          lang,
          code,
          args: args ?? [],
          session_id: resolvedSessionId,
          onOutput,
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
            formattedOutput += `- ${f.name} | ${isImage ? imageMessage : otherMessage}`;
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
