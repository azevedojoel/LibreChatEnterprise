/**
 * lint tool: Run Ruff on Python files, write lint_status.json.
 * Prefers workspace .venv/bin/ruff, then code-exec venv, then system ruff.
 */
const path = require('path');
const fs = require('fs').promises;
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { getRuffPath } = require('~/server/services/LocalCodeExecution/executor');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const LINT_STATUS_FILE = 'lint_status.json';

/** Ruff concise format: path:line:col: CODE message. Meta lines (Found N errors., fixable...) are excluded. */
const RUFF_DIAG_REGEX = /^[^:]+:\d+:\d+:\s+[A-Z]\d+/;

function resolvePath(workspaceRoot, relativePath) {
  const normalizedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(normalizedRoot, relativePath);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path "${relativePath}" escapes workspace`);
  }
  return resolved;
}

async function resolveRuffPath(workspaceRoot) {
  const binDir = path.join(workspaceRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
  const workspaceRuff = path.join(binDir, process.platform === 'win32' ? 'ruff.exe' : 'ruff');
  try {
    await fs.access(workspaceRuff);
    return workspaceRuff;
  } catch {
    /* workspace venv has no ruff */
  }
  return getRuffPath();
}

async function runRuff(workspaceRoot, targetPath) {
  try {
    const ruffPath = await resolveRuffPath(workspaceRoot);
    const args = ['check', targetPath, '--output-format=concise'];
    const opts = { cwd: workspaceRoot, timeout: 10000 };
    let stdout, stderr;
    if (ruffPath) {
      try {
        const result = await execFileAsync(ruffPath, args, opts);
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (e) {
        stdout = e.stdout;
        stderr = e.stderr;
        throw e;
      }
    } else {
      const result = await execAsync(`ruff check "${targetPath}" --output-format=concise`, opts);
      stdout = result.stdout;
      stderr = result.stderr;
    }
    const output = (stdout || stderr || '').trim();
    const rawLines = output ? output.split('\n').filter(Boolean) : [];
    const errors = rawLines.filter(
      (line) => !/all checks passed/i.test(line) && RUFF_DIAG_REGEX.test(line),
    );
    const hasErrors = errors.length > 0;
    return { hasErrors, errors, linter: 'ruff' };
  } catch (err) {
    if (err.stdout || err.stderr) {
      const output = (err.stdout || err.stderr || '').trim();
      const rawLines = output ? output.split('\n').filter(Boolean) : [];
      const errors = rawLines.filter((line) => RUFF_DIAG_REGEX.test(line));
      return {
        hasErrors: errors.length > 0,
        errors: errors.length > 0 ? errors : [err.message],
        linter: 'ruff',
      };
    }
    logger.warn('[lint] Ruff not available:', err?.message || err);
    return { hasErrors: false, errors: [], linter: 'ruff', note: 'Ruff unavailable.' };
  }
}

/**
 * Run Ruff on a single file. Writes lint_status.json. Use for programmatic lint (e.g. generate_code).
 * @param {string} workspaceRoot - Absolute workspace path
 * @param {string} relativePath - File path relative to workspace
 * @returns {Promise<{ hasErrors: boolean; errors: string[]; summary: string }>}
 */
async function runLintOnFile(workspaceRoot, relativePath) {
  const root = workspaceRoot;
  const relPath = (relativePath ?? '').trim() || '.';
  try {
    const absPath = resolvePath(root, relPath);
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat) {
      const status = { hasErrors: true, lastLintedPath: relPath, errors: [`Path "${relPath}" not found`] };
      await fs.writeFile(path.join(root, LINT_STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
      return { hasErrors: true, errors: status.errors, summary: `Path "${relPath}" not found` };
    }
    if (!stat.isFile()) {
      const status = { hasErrors: true, lastLintedPath: relPath, errors: ['Path is not a file'] };
      await fs.writeFile(path.join(root, LINT_STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
      return { hasErrors: true, errors: status.errors, summary: 'Path is not a file' };
    }
    const ext = path.extname(absPath).toLowerCase();
    if (ext !== '.py') {
      const status = { hasErrors: true, lastLintedPath: relPath, errors: ['Only .py files are supported.'] };
      await fs.writeFile(path.join(root, LINT_STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
      return { hasErrors: true, errors: status.errors, summary: 'Only .py files are supported.' };
    }
    const result = await runRuff(root, relPath);
    const status = { hasErrors: result.hasErrors, lastLintedPath: relPath, errors: result.errors };
    await fs.writeFile(path.join(root, LINT_STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
    let summary = result.hasErrors
      ? `Lint found ${result.errors.length} error(s). Fix before run_program.`
      : 'No lint errors.';
    if (result.note) summary += ` (${result.note})`;
    return { hasErrors: result.hasErrors, errors: result.errors, summary };
  } catch (err) {
    logger.error('[runLintOnFile] Error:', err);
    const status = { hasErrors: true, lastLintedPath: relPath, errors: [err.message] };
    try {
      await fs.writeFile(path.join(root, LINT_STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
    return { hasErrors: true, errors: [err.message], summary: err.message };
  }
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createLintTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async (rawInput) => {
      const { path: targetPath } = rawInput ?? {};
      const relPath = (targetPath ?? '.').trim() || '.';

      try {
        const absPath = resolvePath(root, relPath);
        const stat = await fs.stat(absPath).catch(() => null);
        if (!stat) {
          return JSON.stringify({
            hasErrors: true,
            lastLintedPath: relPath,
            errors: [`Path "${relPath}" not found`],
          });
        }

        let hasErrors = false;
        let errors = [];
        let lastLintedPath = relPath;
        let linterNote = null;

        if (stat.isFile()) {
          const ext = path.extname(absPath).toLowerCase();
          if (ext !== '.py') {
            return JSON.stringify({
              hasErrors: true,
              lastLintedPath: relPath,
              errors: ['Only .py files are supported. This workspace is Python-only.'],
            });
          }
          const result = await runRuff(root, relPath);
          hasErrors = result.hasErrors;
          errors = result.errors;
          linterNote = result.note;
        } else if (stat.isDirectory()) {
          const { glob } = require('glob');
          const pyFiles = await glob('**/*.py', { cwd: absPath, nodir: true });
          const allErrors = [];
          for (const f of pyFiles) {
            const result = await runRuff(root, path.join(relPath, f));
            if (result.note) linterNote = result.note;
            if (result.hasErrors) {
              hasErrors = true;
              allErrors.push(...result.errors.map((e) => `${f}: ${e}`));
            }
          }
          errors = allErrors;
        } else {
          errors = ['Path is not a file or directory'];
          hasErrors = true;
        }

        const status = {
          hasErrors,
          lastLintedPath,
          errors,
        };
        const statusPath = path.join(root, LINT_STATUS_FILE);
        await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf8');

        let summary = hasErrors
          ? `Lint found ${errors.length} error(s). Fix before run_program.`
          : 'No lint errors.';
        if (linterNote) {
          summary += ` (${linterNote})`;
        }
        return JSON.stringify({ ...status, summary });
      } catch (err) {
        logger.error('[lint] Error:', err);
        const status = {
          hasErrors: true,
          lastLintedPath: relPath,
          errors: [err.message],
        };
        try {
          await fs.writeFile(path.join(root, LINT_STATUS_FILE), JSON.stringify(status, null, 2), 'utf8');
        } catch {
          // ignore
        }
        return JSON.stringify(status);
      }
    },
    {
      name: 'lint',
      description:
        'Run Ruff linter on Python files. Updates lint_status.json. run_program blocks if lint has errors.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Python file or directory path relative to workspace' },
        },
        required: ['path'],
      },
    },
  );
}

module.exports = { createLintTool, runLintOnFile };
