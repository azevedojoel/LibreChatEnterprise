/**
 * run_program tool: Execute a Python script, check lint_status.json, commit on success.
 */
const path = require('path');
const fs = require('fs').promises;
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const LINT_STATUS_FILE = 'lint_status.json';
const MAX_DIFF_LINES = 50;
const MAX_OUTPUT_CHARS = 800;

let _pythonCmd = null;
async function getPythonCmd() {
  if (_pythonCmd) return _pythonCmd;
  if (process.env.PYTHON_CMD) {
    _pythonCmd = process.env.PYTHON_CMD;
    return _pythonCmd;
  }
  try {
    await execAsync('python3 --version', { timeout: 2000 });
    _pythonCmd = 'python3';
  } catch {
    _pythonCmd = 'python';
  }
  return _pythonCmd;
}

async function getWorkspacePythonCmd(workspaceRoot) {
  const venvPython = path.join(
    workspaceRoot,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  );
  try {
    await fs.access(venvPython);
    return venvPython;
  } catch {
    return getPythonCmd();
  }
}

function resolvePath(workspaceRoot, relativePath) {
  const normalizedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(normalizedRoot, relativePath);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path "${relativePath}" escapes workspace`);
  }
  return resolved;
}

function truncateDiff(diff, maxLines = MAX_DIFF_LINES) {
  const lines = diff.split('\n');
  if (lines.length <= maxLines) return { diff, truncated: false };
  return {
    diff: lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`,
    truncated: true,
    totalLines: lines.length,
  };
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createRunProgramTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async (rawInput) => {
      const { path: targetPath, args: rawArgs } = rawInput ?? {};
      const relPath = (targetPath ?? '').trim();
      const args = Array.isArray(rawArgs) ? rawArgs.filter((a) => typeof a === 'string') : [];
      if (!relPath) {
        return JSON.stringify({ error: 'path is required' });
      }

      try {
        const ext = path.extname(relPath).toLowerCase();
        if (ext !== '.py') {
          return JSON.stringify({
            error: 'Only .py files are supported. This workspace is Python-only.',
            file: relPath,
          });
        }

        const statusPath = path.join(root, LINT_STATUS_FILE);
        let lintStatus = null;
        try {
          const content = await fs.readFile(statusPath, 'utf8');
          lintStatus = JSON.parse(content);
        } catch {
          // No lint run yet - allow execution per plan
        }

        if (lintStatus?.hasErrors === true) {
          return JSON.stringify({
            error: 'Lint has errors. Fix them before running. Call lint(path) and fix all errors.',
            file: relPath,
            ...(args.length > 0 && { args }),
          });
        }

        const absPath = resolvePath(root, relPath);
        const stat = await fs.stat(absPath).catch(() => null);
        if (!stat || !stat.isFile()) {
          return JSON.stringify({ error: `File "${relPath}" not found`, file: relPath });
        }

        const pythonCmd = await getWorkspacePythonCmd(root);
        let stdout = '';
        let stderr = '';
        try {
          const result = await execFileAsync(pythonCmd, [relPath, ...args], {
            cwd: root,
            timeout: 60000,
          });
          stdout = result.stdout || '';
          stderr = result.stderr || '';
        } catch (err) {
          stderr = (err.stderr || err.stdout || err.message || '').trim();
          return JSON.stringify({
            error: `Execution failed: ${stderr || 'Unknown error'}`,
            file: relPath,
            stderr,
            ...(args.length > 0 && { args }),
          });
        }

        const outputSummary = (stdout + '\n' + stderr).trim().slice(0, 200);
        const commitMsg = `run: ${relPath}\n\n${outputSummary}`;

        const gitAdd = await execAsync(`git add "${relPath}"`, { cwd: root }).catch(() => null);
        const gitCommit = await execAsync(`git commit -m ${JSON.stringify(commitMsg)}`, {
          cwd: root,
        }).catch((e) => ({ stderr: e.message }));

        let diff = '';
        try {
          const { stdout: diffOut } = await execAsync('git diff --cached', { cwd: root });
          diff = (diffOut || '').trim();
        } catch {
          // ignore
        }

        const { diff: diffResult, truncated } = truncateDiff(diff || '(no diff)');
        const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
        const output =
          combinedOutput.length > MAX_OUTPUT_CHARS
            ? combinedOutput.slice(0, MAX_OUTPUT_CHARS) + '\n... (truncated)'
            : combinedOutput || undefined;

        return JSON.stringify({
          summary: `Ran ${relPath} successfully. Committed.`,
          file: relPath,
          ...(args.length > 0 && { args }),
          output,
          diff: diffResult,
          truncated,
        });
      } catch (err) {
        logger.error('[run_program] Error:', err);
        return JSON.stringify({
          error: err.message || 'Failed to run program',
          file: relPath,
          ...(args.length > 0 && { args }),
        });
      }
    },
    {
      name: 'run_program',
      description:
        'Execute a Python script (e.g. main.py). Optional args array for CLI arguments. Blocks if lint_status.json has errors. On success: git add + commit with output summary. On failure: no commit.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Python entry file path (e.g. main.py)' },
          args: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional command-line arguments to pass to the script (e.g. ["--city", "London"])',
          },
        },
        required: ['path'],
      },
    },
  );
}

module.exports = { createRunProgramTool };
