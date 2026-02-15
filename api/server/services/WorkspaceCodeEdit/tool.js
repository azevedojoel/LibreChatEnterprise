/**
 * LangChain tools for workspace file editing (read, edit, create, list, search).
 */
const { tool } = require('@langchain/core/tools');
const { readFile, editFile, createFile, deleteFile, listFiles, searchFiles } = require('./executor');

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
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.content;
    },
    {
      name: 'read_file',
      description:
        'Read the contents of a file. Path is relative to the workspace root.',
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
    }
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
        'Replace exact old_string with new_string in a file. old_string must match exactly once.',
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
    }
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
        'Create or overwrite a file. Parent directories are created if needed.',
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
    }
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
        'Delete a file. Use for cleanup. Path is relative to workspace root.',
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
    }
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
      const lines = result.entries.map(
        (e) => `${e.name} (${e.type})`
      );
      return lines.length ? lines.join('\n') : '(empty)';
    },
    {
      name: 'list_files',
      description:
        'List files and directories. Use to discover files before reading or editing. For Code Interpreter: user-uploaded files and code-generated output are in the "output" directory—use path "output" to list them.',
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
            description: 'Filter by extension (e.g. "py" for *.py)',
          },
        },
      },
    }
  );

  const searchFilesTool = tool(
    async (rawInput) => {
      const result = await searchFiles({
        workspaceRoot: root,
        pattern: rawInput.pattern,
        relativePath: rawInput.path?.trim() || '.',
        extension: rawInput.extension,
        maxResults: rawInput.max_results ?? 50,
      });
      if (result.error) {
        return `Error: ${result.error}`;
      }
      if (result.matches.length === 0) {
        return 'No matches found.';
      }
      return result.matches
        .map((m) => `${m.path}:${m.line}: ${m.content}`)
        .join('\n');
    },
    {
      name: 'search_files',
      description:
        'Search file contents for a pattern. Useful for finding definitions or usages.',
      schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (literal string)',
          },
          path: {
            type: 'string',
            description: 'Directory or file to search (default: ".")',
          },
          extension: {
            type: 'string',
            description: 'Filter by extension (e.g. "py")',
          },
          max_results: {
            type: 'number',
            description: 'Maximum matches to return (default: 50)',
          },
        },
        required: ['pattern'],
      },
    }
  );

  return [
    readFileTool,
    editFileTool,
    createFileTool,
    deleteFileTool,
    listFilesTool,
    searchFilesTool,
  ];
}

module.exports = { createWorkspaceCodeEditTools };
