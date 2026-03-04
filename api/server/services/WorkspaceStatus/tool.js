/**
 * workspace_status, workspace_init, reset_workspace tools for Coder agent.
 */
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

const execAsync = promisify(exec);

const CODER_INIT_REPO_URL = process.env.CODER_INIT_REPO_URL || '';
const { ensureWorkspaceVenv } = require('~/server/services/WorkspaceVenv/ensure');
const { DEFAULT_PYPROJECT_RUFF } = require('~/server/services/Lint/ruffConfig');

async function isWorkspaceEmpty(workspaceRoot) {
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.name !== '.' && e.name !== '..').length === 0;
}

async function cloneTemplateIntoWorkspace(workspaceRoot, url) {
  try {
    await execAsync(`git clone ${JSON.stringify(url)} .`, {
      cwd: workspaceRoot,
      timeout: 30000,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

const DEFAULT_GITIGNORE = `# Python
__pycache__/
*.py[cod]
*.pyo
.venv/
venv/
*.egg-info/
*.egg
dist/
build/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;

const DEFAULT_PYPROJECT = `[project]
name = "workspace"
version = "0.1.0"
requires-python = ">=3.9"

${DEFAULT_PYPROJECT_RUFF}
`;

const DEFAULT_REQUIREMENTS = 'ruff>=0.1.0\n';

async function runGit(workspaceRoot, args) {
  try {
    const { stdout, stderr } = await execAsync(`git ${args.join(' ')}`, {
      cwd: workspaceRoot,
      timeout: 5000,
    });
    return { stdout: (stdout || '').trim(), stderr: (stderr || '').trim(), success: true };
  } catch (err) {
    return {
      stdout: '',
      stderr: err.stderr || err.message || '',
      success: false,
    };
  }
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createWorkspaceStatusTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async () => {
      try {
        const parts = [];

        const gitStatus = await runGit(root, ['status', '--short']);
        if (gitStatus.success) {
          parts.push('## Git status\n' + (gitStatus.stdout || '(clean)'));
        } else {
          parts.push('## Git status\n(not a git repo)');
        }

        const gitLog = await runGit(root, ['log', '-1', '--oneline']);
        if (gitLog.success && gitLog.stdout) {
          parts.push('\n## Last commit\n' + gitLog.stdout);
        }

        try {
          const planPath = path.join(root, 'plan.md');
          const planContent = await fs.readFile(planPath, 'utf8').catch(() => null);
          if (planContent) {
            parts.push('\n## Plan\n' + planContent.slice(0, 500) + (planContent.length > 500 ? '...' : ''));
          }
        } catch {
          // no plan
        }

        try {
          const todoPath = path.join(root, 'todo.json');
          const todoContent = await fs.readFile(todoPath, 'utf8').catch(() => null);
          if (todoContent) {
            const todo = JSON.parse(todoContent);
            const items = Array.isArray(todo) ? todo : todo?.items ?? [];
            parts.push('\n## Todo\n' + items.map((i) => `- [${i.status || 'pending'}] ${i.item ?? i}`).join('\n'));
          }
        } catch {
          // no todo
        }

        const joined = parts.join('\n');
        if (!joined) {
          const base = 'Workspace empty. Call workspace_init to initialize.';
          return CODER_INIT_REPO_URL ? `${base} Template: ${CODER_INIT_REPO_URL}` : base;
        }
        return joined;
      } catch (err) {
        logger.error('[workspace_status] Error:', err);
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'workspace_status',
      description: 'Git status, todo list, last commit. Call first on every invocation.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createWorkspaceInitTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async () => {
      try {
        await fs.mkdir(root, { recursive: true });

        const hasGit = await fs.access(path.join(root, '.git')).then(() => true).catch(() => false);
        if (hasGit) {
          return 'Workspace already initialized.';
        }

        const empty = await isWorkspaceEmpty(root);
        if (!empty) {
          return 'Workspace already initialized.';
        }

        if (CODER_INIT_REPO_URL) {
          const cloneResult = await cloneTemplateIntoWorkspace(root, CODER_INIT_REPO_URL);
          if (cloneResult.success) {
            const venvResult = await ensureWorkspaceVenv(root);
            const depsNote = venvResult.success ? ' Dependencies installed.' : '';
            return `Workspace initialized from template: ${CODER_INIT_REPO_URL}. Read AGENT.md if present.${depsNote}`;
          }
          logger.error('[workspace_init] Template clone failed, falling back to empty init:', cloneResult.error);
        }

        const gitInit = await runGit(root, ['init']);
        if (!gitInit.success && !gitInit.stderr.includes('already exists')) {
          return `Error: git init failed: ${gitInit.stderr}`;
        }
        const gitignorePath = path.join(root, '.gitignore');
        try {
          await fs.access(gitignorePath);
        } catch {
          await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf8');
        }
        const pyprojectPath = path.join(root, 'pyproject.toml');
        try {
          await fs.access(pyprojectPath);
        } catch {
          await fs.writeFile(pyprojectPath, DEFAULT_PYPROJECT, 'utf8');
        }
        const reqPath = path.join(root, 'requirements.txt');
        try {
          await fs.access(reqPath);
        } catch {
          await fs.writeFile(reqPath, DEFAULT_REQUIREMENTS, 'utf8');
        }
        const venvResult = await ensureWorkspaceVenv(root);
        const depsNote = venvResult.success ? ' Dependencies installed.' : '';
        return (
          (CODER_INIT_REPO_URL
            ? `Workspace initialized (template unavailable: ${CODER_INIT_REPO_URL}, using empty setup).`
            : 'Workspace initialized.') + depsNote
        );
      } catch (err) {
        logger.error('[workspace_init] Error:', err);
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'workspace_init',
      description: 'Init workspace. Clones template if configured, else git init + .gitignore. Call when workspace_status says empty.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createResetWorkspaceTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async () => {
      try {
        const normalizedRoot = path.resolve(root);
        const entries = await fs.readdir(normalizedRoot, { withFileTypes: true }).catch(() => []);
        for (const ent of entries) {
          if (ent.name === '.' || ent.name === '..') continue;
          const full = path.join(normalizedRoot, ent.name);
          await fs.rm(full, { recursive: true, force: true });
        }

        if (CODER_INIT_REPO_URL) {
          const cloneResult = await cloneTemplateIntoWorkspace(normalizedRoot, CODER_INIT_REPO_URL);
          if (cloneResult.success) {
            const venvResult = await ensureWorkspaceVenv(normalizedRoot);
            const depsNote = venvResult.success ? ' Dependencies installed.' : '';
            return `Workspace reset. Cloned: ${CODER_INIT_REPO_URL}.${depsNote}`;
          }
          logger.error('[reset_workspace] Template clone failed, falling back to empty init:', cloneResult.error);
        }

        const gitInit = await runGit(normalizedRoot, ['init']);
        if (!gitInit.success && !gitInit.stderr.includes('already exists')) {
          return `Error: git init failed: ${gitInit.stderr}`;
        }
        const gitignorePath = path.join(normalizedRoot, '.gitignore');
        await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf8');
        const pyprojectPath = path.join(normalizedRoot, 'pyproject.toml');
        await fs.writeFile(pyprojectPath, DEFAULT_PYPROJECT, 'utf8');
        const reqPath = path.join(normalizedRoot, 'requirements.txt');
        await fs.writeFile(reqPath, DEFAULT_REQUIREMENTS, 'utf8');
        const venvResult = await ensureWorkspaceVenv(normalizedRoot);
        const depsNote = venvResult.success ? ' Dependencies installed.' : '';
        return (
          (CODER_INIT_REPO_URL
            ? `Workspace reset (template unavailable: ${CODER_INIT_REPO_URL}, using empty setup).`
            : 'Workspace reset.') + depsNote
        );
      } catch (err) {
        logger.error('[reset_workspace] Error:', err);
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'reset_workspace',
      description: 'Wipe workspace and re-init. Only when handoff says reset: true.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );
}

module.exports = {
  createWorkspaceStatusTool,
  createWorkspaceInitTool,
  createResetWorkspaceTool,
};
