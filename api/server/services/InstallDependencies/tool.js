/**
 * install_dependencies tool: Create .venv and pip install -r requirements.txt in workspace.
 */
const { tool } = require('@langchain/core/tools');
const { ensureWorkspaceVenv } = require('~/server/services/WorkspaceVenv/ensure');

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createInstallDependenciesTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async () => {
      const result = await ensureWorkspaceVenv(root);
      return JSON.stringify({
        success: result.success,
        message: result.message,
        ...(result.stderr && { stderr: result.stderr }),
      });
    },
    {
      name: 'install_dependencies',
      description:
        'pip install -r requirements.txt into workspace .venv. Call after adding/updating requirements.txt, before run_program.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );
}

module.exports = { createInstallDependenciesTool };
