/**
 * generate_code tool: Calls configured provider (OpenRouter, OpenAI, Anthropic, DeepSeek) to generate code.
 * Writes to workspace, returns diff. Supports streaming when emitToolOutputDelta callback is provided.
 * Requires codeGeneration.provider and codeGeneration.model in librechat.yaml.
 */
const path = require('path');
const fs = require('fs').promises;
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

const { MAX_DIFF_LINES } = require('~/server/services/WorkspaceCodeEdit/diffUtils');

const PROVIDER_CONFIG = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: ['OPENROUTER_KEY', 'OPENROUTER_API_KEY'],
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: ['OPENAI_API_KEY'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: ['DEEPSEEK_API_KEY'],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: ['ANTHROPIC_API_KEY'],
  },
};

function getApiKey(provider) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return null;
  for (const env of config.apiKeyEnv) {
    const val = process.env[env];
    if (val && val.length > 0) return val;
  }
  return null;
}

async function callOpenAICompatible(baseUrl, apiKey, model, prompt) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (content == null) {
    throw new Error('No content in API response');
  }
  return content;
}

async function callOpenAICompatibleStreaming(baseUrl, apiKey, model, prompt, onChunk) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 4096,
      stream: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText}`);
  }
  const reader = res.body;
  if (!reader) {
    throw new Error('No response body for streaming');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let chunkCount = 0;
  if (typeof onChunk === 'function') {
    console.log('[generate_code_stream] START streaming');
  }
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            fullContent += delta;
            if (typeof onChunk === 'function') {
              chunkCount++;
              if (chunkCount === 1 || chunkCount % 10 === 0) {
                console.log(
                  `[generate_code_stream] chunk ${chunkCount} (totalLen: ${fullContent.length})`,
                );
              }
              onChunk(delta);
            }
          }
        } catch {
          // ignore parse errors for comment lines etc.
        }
      }
    }
  }
  if (typeof onChunk === 'function') {
    console.log(
      `[generate_code_stream] END streaming (totalLen: ${fullContent.length}, chunks: ${chunkCount})`,
    );
  }
  return fullContent;
}

async function callAnthropic(apiKey, model, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const textBlock = data?.content?.find((b) => b.type === 'text');
  if (!textBlock || typeof textBlock.text !== 'string') {
    throw new Error('No text content in Anthropic response');
  }
  return textBlock.text;
}

async function callAnthropicStreaming(apiKey, model, prompt, onChunk) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      stream: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  const reader = res.body;
  if (!reader) {
    throw new Error('No response body for streaming');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let chunkCount = 0;
  if (typeof onChunk === 'function') {
    console.log('[generate_code_stream] START streaming');
  }
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const text = parsed.delta.text;
            if (typeof text === 'string') {
              fullContent += text;
              if (typeof onChunk === 'function') {
                chunkCount++;
                if (chunkCount === 1 || chunkCount % 10 === 0) {
                  console.log(
                    `[generate_code_stream] chunk ${chunkCount} (totalLen: ${fullContent.length})`,
                  );
                }
                onChunk(text);
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
  if (typeof onChunk === 'function') {
    console.log(
      `[generate_code_stream] END streaming (totalLen: ${fullContent.length}, chunks: ${chunkCount})`,
    );
  }
  return fullContent;
}

function extractCodeFromResponse(content) {
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:[\w]*)\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return trimmed;
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 * @param {string} params.provider - openrouter | openai | anthropic | deepseek
 * @param {string} params.model - Provider-specific model ID
 */
function createGenerateCodeTool({ workspaceRoot, provider, model }) {
  const root = workspaceRoot;
  const prov = provider;
  const mod = model;

  if (!prov || !mod) {
    throw new Error(
      'generate_code requires codeGeneration.provider and codeGeneration.model in librechat.yaml',
    );
  }
  if (!PROVIDER_CONFIG[prov]) {
    throw new Error(
      `generate_code: invalid provider "${prov}". Must be one of: openrouter, openai, anthropic, deepseek`,
    );
  }

  return tool(
    async (rawInput) => {
      const {
        file_path,
        request,
        _emitToolOutputDelta,
        _toolCallId,
        _stepId,
      } = rawInput ?? {};
      if (!file_path || typeof file_path !== 'string') {
        return JSON.stringify({ error: 'file_path is required' });
      }
      if (!request || typeof request !== 'string') {
        return JSON.stringify({ error: 'request is required' });
      }
      const key = getApiKey(prov);
      if (!key) {
        const config = PROVIDER_CONFIG[prov];
        return JSON.stringify({
          error: `API key not configured for ${prov}. Set ${config.apiKeyEnv.join(' or ')}.`,
        });
      }

      const emitDelta =
        typeof _emitToolOutputDelta === 'function' && _toolCallId
          ? (delta) => _emitToolOutputDelta(_toolCallId, _stepId, delta)
          : null;
      if (typeof _emitToolOutputDelta === 'function' && !_toolCallId) {
        logger.warn('[generate_code] emitToolOutputDelta provided but _toolCallId missing - streaming disabled');
      }

      const normalizedRoot = path.resolve(root);
      const resolved = path.resolve(normalizedRoot, file_path);
      if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
        return JSON.stringify({ error: `Path "${file_path}" escapes workspace`, file: file_path });
      }
      try {
        await fs.access(resolved);
        return JSON.stringify({
          error: 'File already exists. Use workspace_edit_file to modify existing files.',
          file: file_path,
        });
      } catch (err) {
        if (err.code !== 'ENOENT') {
          return JSON.stringify({ error: err.message || 'Failed to check file', file: file_path });
        }
      }

      try {
        const prompt = `Generate Python code for the following request. Write ONLY the code, no markdown, no explanation. The code will be written to file: ${file_path}. Use standard library and common packages (requests, etc.) as needed.

Request: ${request}`;

        let response;
        if (prov === 'anthropic') {
          if (emitDelta) {
            response = await callAnthropicStreaming(key, mod, prompt, emitDelta);
          } else {
            response = await callAnthropic(key, mod, prompt);
          }
        } else {
          const config = PROVIDER_CONFIG[prov];
          if (emitDelta) {
            response = await callOpenAICompatibleStreaming(
              config.baseUrl,
              key,
              mod,
              prompt,
              emitDelta,
            );
          } else {
            response = await callOpenAICompatible(config.baseUrl, key, mod, prompt);
          }
        }
        const code = extractCodeFromResponse(response);

        const { createFile } = require('~/server/services/WorkspaceCodeEdit/executor');
        const createResult = await createFile({
          workspaceRoot: root,
          relativePath: file_path,
          content: code,
        });
        if (createResult.error) {
          return JSON.stringify({ error: createResult.error, file: file_path });
        }

        const { runLintOnFile } = require('~/server/services/Lint');
        const lintResult = await runLintOnFile(root, file_path);

        const result = {
          diff: createResult.diff,
          file: file_path,
          summary: createResult.truncated
            ? `Generated ${file_path} (${createResult.totalLines} lines, showing first ${MAX_DIFF_LINES})`
            : createResult.diff == null
              ? `Generated ${file_path} (${createResult.totalLines ?? 0} lines)`
              : `Generated ${file_path}`,
          lint: {
            hasErrors: lintResult.hasErrors,
            errors: lintResult.errors,
            summary: lintResult.summary,
          },
          model: mod,
          provider: prov,
        };
        return JSON.stringify(result);
      } catch (err) {
        logger.error('[generate_code] Error:', err);
        return JSON.stringify({
          error: err.message || 'Failed to generate code',
          file: file_path,
          model: mod,
          provider: prov,
        });
      }
    },
    {
      name: 'generate_code',
      description:
        'Generate Python code via configured LLM. For creating new code only. Provide file_path (e.g. main.py) and request (what to build). Writes the file, auto-lints, and returns diff + lint results. Do NOT use for fixing lint errors on existing files—use workspace_edit_file instead (generate_code has no access to file content). Never write code inline—use this tool for new code generation.',
      schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'File path relative to workspace root' },
          request: {
            type: 'string',
            description: 'What to generate (requirements, behavior, constraints)',
          },
        },
        required: ['file_path', 'request'],
      },
    },
  );
}

module.exports = { createGenerateCodeTool };
