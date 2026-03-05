/**
 * LangChain tools for workspace file editing (read, edit, create, list, search).
 */
const path = require('path');
const { tool } = require('@langchain/core/tools');
const {
  readFile,
  editFile,
  createFile,
  deleteFile,
  listFiles,
  globFiles,
  searchFiles,
  sendFilesToUser,
  pullFileToWorkspace,
  listMyFiles,
} = require('./executor');

/**
 * @param {object} params
 * @param {string} params.workspaceRoot - Absolute path to workspace
 * @returns {import('@langchain/core/tools').DynamicStructuredTool[]}
 */
function createWorkspaceCodeEditTools({ workspaceRoot }) {
  const root = workspaceRoot;

  const readFileTool = tool(
    async (rawInput) => {
      const result = await readFile({
        workspaceRoot: root,
        relativePath: rawInput.path,
        startLine: rawInput.start_line,
        endLine: rawInput.end_line,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.content;
    },
    {
      name: 'workspace_read_file',
      description:
        'Read file contents from workspace. Path is relative to workspace root. Use when: inspecting a file, verifying edits, or reading a specific section. Optionally use start_line and end_line (1-based, inclusive) to read a range—helps with large files.',
      schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to workspace root',
          },
          start_line: {
            type: 'number',
            description:
              '1-based start line (inclusive). Both inclusive. Omit both for full file. Provide both together for a range, or omit both.',
          },
          end_line: {
            type: 'number',
            description:
              '1-based end line (inclusive). Provide both with start_line for a range; for single line use start_line = end_line.',
          },
        },
        required: ['path'],
      },
    },
  );

  const editFileTool = tool(
    async (rawInput) => {
      const result = await editFile({
        workspaceRoot: root,
        relativePath: rawInput.path,
        old_string: rawInput.old_string,
        new_string: rawInput.new_string ?? '',
      });
      if (result.error) {
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({
        diff: result.diff,
        file: result.file,
        summary: result.summary,
        ...(result.truncated && { truncated: result.truncated, totalLines: result.totalLines }),
      });
    },
    {
      name: 'workspace_edit_file',
      description:
        'Edit a file in the workspace. Replace exact old_string with new_string. Use for fixing lint errors: read the file with workspace_read_file, identify the issue from lint output, then apply old_string/new_string edits. old_string must match exactly once. Fails if old_string appears 0 or 2+ times; use search_user_files first to verify. Whitespace must match exactly.',
      schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to workspace root',
          },
          old_string: {
            type: 'string',
            description: 'Exact substring to replace (must appear exactly once)',
          },
          new_string: {
            type: 'string',
            description: 'Replacement string',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  );

  const createFileTool = tool(
    async (rawInput) => {
      const result = await createFile({
        workspaceRoot: root,
        relativePath: rawInput.path,
        content: rawInput.content ?? '',
      });
      if (result.error) {
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({
        diff: result.diff,
        file: result.file,
        summary: result.summary,
        ...(result.truncated && { truncated: result.truncated, totalLines: result.totalLines }),
      });
    },
    {
      name: 'workspace_create_file',
      description:
        'Create or overwrite a file in the workspace. Overwrites if file exists. Parent directories created if needed.',
      schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to workspace root',
          },
          content: {
            type: 'string',
            description: 'File content',
          },
        },
        required: ['path', 'content'],
      },
    },
  );

  const deleteFileTool = tool(
    async (rawInput) => {
      const result = await deleteFile({
        workspaceRoot: root,
        relativePath: rawInput.path,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      return `Deleted ${rawInput.path} successfully.`;
    },
    {
      name: 'workspace_delete_file',
      description:
        'Delete a file from the workspace. Permanent. Prefer for temporary/scratch files; confirm path before deleting. Path is relative to workspace root.',
      schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to workspace root',
          },
        },
        required: ['path'],
      },
    },
  );

  const listFilesTool = tool(
    async (rawInput) => {
      const result = await listFiles({
        workspaceRoot: root,
        relativePath: rawInput.path?.trim() || '.',
        extension: rawInput.extension,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      const lines = result.entries.map((e) => `${e.name} (${e.type})`);
      return lines.length ? lines.join('\n') : '(empty)';
    },
    {
      name: 'workspace_list_files',
      description:
        'List files and subdirectories in a workspace directory. Use when: exploring a known path; use workspace_glob_files when you need pattern-based discovery (e.g. *.py).',
      schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Directory path relative to workspace root. Use "." for root (default: ".")',
          },
          extension: {
            type: 'string',
            description: 'Extension without leading dot (e.g. "py" means *.py)',
          },
        },
      },
    },
  );

  const searchFilesTool = tool(
    async (rawInput) => {
      const result = await searchFiles({
        workspaceRoot: root,
        pattern: rawInput.pattern,
        relativePath: rawInput.path?.trim() || '.',
        extension: rawInput.extension,
        maxResults: rawInput.max_results ?? 50,
        useRegex: rawInput.use_regex ?? false,
        contextLines: rawInput.context_lines ?? 0,
        caseSensitive: rawInput.case_sensitive ?? true,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      if (result.matches.length === 0) {
        return 'No matches found.';
      }
      const lines = [];
      for (const m of result.matches) {
        if (m.contextBefore && m.contextBefore.length > 0) {
          const startLine = m.line - m.contextBefore.length;
          for (let i = 0; i < m.contextBefore.length; i++) {
            lines.push(`${m.path}:${startLine + i}: ${m.contextBefore[i]}`);
          }
        }
        lines.push(`${m.path}:${m.line}: ${m.content}`);
        if (m.contextAfter && m.contextAfter.length > 0) {
          for (let i = 0; i < m.contextAfter.length; i++) {
            lines.push(`${m.path}:${m.line + 1 + i}: ${m.contextAfter[i]}`);
          }
        }
        if (m.contextBefore?.length || m.contextAfter?.length) {
          lines.push('---');
        }
      }
      if (lines[lines.length - 1] === '---') {
        lines.pop();
      }
      return lines.join('\n');
    },
    {
      name: 'search_user_files',
      description:
        'Search file contents in the user files for a pattern. Returns path:line: content per match. Use when: finding definitions, usages, references, or debugging. Supports literal (default) or regex (use_regex=true), context_lines for surrounding lines, case_sensitive. With context_lines > 0, output includes path:line blocks separated by ---.',
      schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (literal or regex when use_regex=true)',
          },
          path: {
            type: 'string',
            description: 'Directory or file to search (default: ".")',
          },
          extension: {
            type: 'string',
            description: 'Extension without leading dot (e.g. "py" means *.py)',
          },
          max_results: {
            type: 'number',
            description: 'Maximum matches to return (default: 50)',
          },
          use_regex: {
            type: 'boolean',
            description: 'Treat pattern as regex (default: false)',
          },
          context_lines: {
            type: 'number',
            description:
              'Lines before/after each match. Output format: path:line: content per line, with --- between match blocks (default: 0)',
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Case-sensitive match (default: true)',
          },
        },
        required: ['pattern'],
      },
    },
  );

  const globFilesTool = tool(
    async (rawInput) => {
      const result = await globFiles({
        workspaceRoot: root,
        pattern: rawInput.pattern,
        relativePath: rawInput.path?.trim() || '.',
        maxResults: rawInput.max_results ?? 200,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      if (result.paths.length === 0) {
        return 'No files found.';
      }
      return result.paths.join('\n');
    },
    {
      name: 'workspace_glob_files',
      description:
        'Find files in the workspace matching a glob pattern (e.g. *.py, src/**/*.ts). Use when: discovering files by pattern (all tests, configs, etc.). Prefer over workspace_list_files when you need pattern matching across subdirectories. Path: directory to search (default "."). Results limited to max_results (default 200).',
      schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern (e.g. "*.py", "src/**/*.ts")',
          },
          path: {
            type: 'string',
            description: 'Directory to search (default: ".")',
          },
          max_results: {
            type: 'number',
            description: 'Maximum files to return (default: 200)',
          },
        },
        required: ['pattern'],
      },
    },
  );

  const sessionId = path.basename(root);
  const sendFileToUserTool = tool(
    async (rawInput) => {
      const paths = Array.isArray(rawInput.paths) ? rawInput.paths : [rawInput.paths].filter(Boolean);
      const result = await sendFilesToUser({
        workspaceRoot: root,
        paths,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      return [
        `Sent ${result.files.length} file(s) to user: ${result.files.map((f) => f.name).join(', ')}.`,
        { session_id: sessionId, files: result.files },
      ];
    },
    {
      name: 'workspace_send_file_to_user',
      description:
        'Send one or more files from the workspace to the user. Files are displayed in the chat and saved for download. Use after execute_code creates files (e.g. plots, CSVs) that the user should see. Paths are relative to workspace root.',
      schema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths relative to workspace root (e.g. ["output.csv", "chart.png"])',
            minItems: 1,
          },
        },
        required: ['paths'],
      },
      responseFormat: 'content_and_artifact',
    },
  );

  return [
    readFileTool,
    editFileTool,
    createFileTool,
    deleteFileTool,
    listFilesTool,
    globFilesTool,
    searchFilesTool,
    sendFileToUserTool,
  ];
}

/**
 * Creates the workspace_pull_file tool. Requires req, workspaceRoot, agentId, userId.
 * @param {object} params
 * @param {string} params.workspaceRoot - Absolute path to workspace
 * @param {import('express').Request} params.req - Request for file streaming
 * @param {string} params.agentId - Agent ID for access check
 * @param {string} params.userId - User ID for access check
 * @returns {import('@langchain/core/tools').DynamicStructuredTool}
 */
function createPullFileToWorkspaceTool({ workspaceRoot, req, agentId, userId }) {
  return tool(
    async (rawInput) => {
      const result = await pullFileToWorkspace({
        workspaceRoot,
        file_id: rawInput.file_id,
        filename: rawInput.filename,
        req,
        userId,
        agentId,
        role: req?.user?.role,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      return JSON.stringify({
        filename: result.filename,
        message: `Pulled ${result.filename} into workspace. Use workspace_read_file or execute_code to work with it.`,
      });
    },
    {
      name: 'workspace_pull_file',
      description:
        "Copy a file from the user's My Files into the workspace. Provide file_id OR filename (e.g. 'contacts_2024.json'). No embeddings—direct lookup by name. Use list_my_files to discover files. After pulling, use workspace_read_file or execute_code.",
      schema: {
        type: 'object',
        description: 'At least one of file_id or filename is required.',
        properties: {
          file_id: {
            type: 'string',
            description: 'File ID (optional if filename provided)',
          },
          filename: {
            type: 'string',
            description: 'Exact or partial filename (e.g. "contacts_2024.json")',
          },
        },
      },
    },
  );
}

/**
 * Creates the list_my_files tool. Simple DB lookup—no embeddings.
 */
function createListMyFilesTool({ req, agentId, userId }) {
  return tool(
    async (rawInput) => {
      const result = await listMyFiles({
        userId,
        filenameFilter: rawInput.filename_filter?.trim() || undefined,
        agentId,
        role: req?.user?.role,
      });
      if (result.length === 0) {
        return 'No files found in My Files.';
      }
      return result.map((f) => `${f.filename} (file_id: ${f.file_id})`).join('\n');
    },
    {
      name: 'list_my_files',
      description:
        "List files in the user's My Files. Optional filename_filter for partial match (e.g. 'contacts' for contacts_*.json). Returns file_id + filename. Use workspace_pull_file to copy into workspace. No embeddings.",
      schema: {
        type: 'object',
        properties: {
          filename_filter: {
            type: 'string',
            description: 'Optional: partial filename match. Omit to list recent files.',
          },
        },
      },
    },
  );
}

module.exports = {
  createWorkspaceCodeEditTools,
  createPullFileToWorkspaceTool,
  createListMyFilesTool,
};
