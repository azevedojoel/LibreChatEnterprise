/**
 * LangChain tools for workspace file editing (read, edit, create, list, search).
 */
const { tool } = require('@langchain/core/tools');
const {
  readFile,
  editFile,
  createFile,
  deleteFile,
  listFiles,
  globFiles,
  searchFiles,
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
      name: 'read_file',
      description:
        'Read file contents. Path is relative to workspace root. Use when: inspecting a file, verifying edits, or reading a specific section. Optionally use start_line and end_line (1-based, inclusive) to read a range—helps with large files.',
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
        return `Error: ${result.error}`;
      }
      return 'File edited successfully.';
    },
    {
      name: 'edit_file',
      description:
        'Replace exact old_string with new_string in a file. old_string must match exactly once. Fails if old_string appears 0 or 2+ times; use search_files first to verify. Whitespace must match exactly.',
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
        return `Error: ${result.error}`;
      }
      return 'File created successfully.';
    },
    {
      name: 'create_file',
      description:
        'Create or overwrite a file. Overwrites if file exists. Parent directories created if needed.',
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
      return 'File deleted successfully.';
    },
    {
      name: 'delete_file',
      description:
        'Delete a file. Permanent. Prefer for temporary/scratch files; confirm path before deleting. Path is relative to workspace root.',
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
      name: 'list_files',
      description:
        'List files and subdirectories in one directory. Use when: exploring a known path; use glob_files when you need pattern-based discovery (e.g. *.py). For Code Interpreter: use path "output" for uploads and generated files.',
      schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Directory path relative to workspace root. Use "." for root; use "output" for Code Interpreter uploads and generated files (default: ".")',
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
      name: 'search_files',
      description:
        'Search file contents for a pattern. Returns path:line: content per match. Use when: finding definitions, usages, references, or debugging. Supports literal (default) or regex (use_regex=true), context_lines for surrounding lines, case_sensitive. With context_lines > 0, output includes path:line blocks separated by ---.',
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
      name: 'glob_files',
      description:
        'Find files matching a glob pattern (e.g. *.py, src/**/*.ts). Use when: discovering files by pattern (all tests, configs, etc.). Prefer over list_files when you need pattern matching across subdirectories. Path: directory to search (default "."). Results limited to max_results (default 200).',
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

  return [
    readFileTool,
    editFileTool,
    createFileTool,
    deleteFileTool,
    listFilesTool,
    globFilesTool,
    searchFilesTool,
  ];
}

module.exports = { createWorkspaceCodeEditTools };
