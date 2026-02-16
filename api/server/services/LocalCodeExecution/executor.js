/**
 * Local code execution via child_process. No external API or key required.
 * Returns same format as remote Code API for processLocalCodeOutput compatibility.
 *
 * Session dirs persist across runs so files from previous executions are available.
 * TODO: Add cleanup job to delete session dirs in SESSION_BASE_DIR older than
 * LOCAL_CODE_SESSION_MAX_AGE_HOURS (e.g. 24). Cron or startup sweep.
 */
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');

const imageExtRegex = /\.(jpg|jpeg|png|gif|webp)$/i;
const EXEC_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 512 * 1024;

const SESSION_BASE_DIR =
  process.env.LIBRECHAT_CODE_SESSIONS_DIR ?? path.join(os.tmpdir(), 'librechat_code_sessions');

function getSessionBaseDir() {
  return SESSION_BASE_DIR;
}

/**
 * Copies agent-uploaded files into the output dir so Python can read them via /mnt/data paths.
 * Resolves virtual filepaths (e.g. /uploads/user/file) and supports cloud storage via streaming.
 * @param {string} outputDir - e.g. SESSION_BASE_DIR/conv_xxx/output (where /mnt/data maps to)
 * @param {Array<{ filepath?: string; filename: string; source?: string }>} agentFiles - Files to copy
 * @param {import('express').Request} [req] - Request object for resolving paths and streaming (required for non-local or virtual paths)
 */
async function injectAgentFiles(outputDir, agentFiles, req) {
  if (!agentFiles?.length) {
    return;
  }
  await fs.mkdir(outputDir, { recursive: true });
  const { pipeline } = require('stream').promises;
  const { createWriteStream } = require('fs');
  const { getStrategyFunctions } = require('~/server/services/Files/strategies');
  const { FileSources } = require('librechat-data-provider');

  for (const f of agentFiles) {
    if (!f.filename || !f.filepath) {
      logger.debug('[LocalCodeExecution] Skipping agent file (missing filename or filepath):', {
        filename: f?.filename,
        hasFilepath: !!f?.filepath,
      });
      continue;
    }
    const dest = path.join(outputDir, path.basename(f.filename));
    try {
      if (req) {
        const source = f.source ?? FileSources.local;
        const { getDownloadStream } = getStrategyFunctions(source);
        if (getDownloadStream) {
          const readStream = await getDownloadStream(req, f.filepath);
          const writeStream = createWriteStream(dest);
          await pipeline(readStream, writeStream);
          continue;
        }
      }
      logger.warn('[LocalCodeExecution] Cannot copy agent file (missing req or unsupported source):', f.filename);
    } catch (e) {
      logger.warn('[LocalCodeExecution] Failed to copy agent file:', f.filename, e?.message);
    }
  }
}

/**
 * @param {object} params
 * @param {string} params.lang - py (Python only)
 * @param {string} params.code
 * @param {string[]} [params.args]
 * @param {string} [params.session_id] - Reuse this session's output dir for file persistence
 * @param {(params: { source: 'stdout'|'stderr'; chunk: string }) => void} [params.onOutput] - Called for each stdout/stderr chunk for streaming
 * @returns {Promise<{ stdout: string; stderr: string; session_id: string; files: Array<{ name: string; buffer: Buffer }> }>}
 */
async function runCodeLocally({
  lang,
  code,
  args = [],
  session_id: existingSessionId,
  onOutput,
}) {
  const session_id = existingSessionId ?? `local_${uuidv4().replace(/-/g, '')}`;
  const sessionDir = path.join(SESSION_BASE_DIR, session_id);
  const outputDir = path.join(sessionDir, 'output');

  await fs.mkdir(outputDir, { recursive: true });

  if (lang !== 'py') {
    throw new Error('Local execution supports Python only.');
  }

  const scriptPath = path.join(sessionDir, 'script.py');
  const outputDirForward = outputDir.replace(/\\/g, '/');
  const patchedCode = code
    .replace(/\/mnt\/data\//g, outputDirForward + '/')
    .replace(/\/mnt\/data\b/g, outputDirForward);
  const wrappedCode = `import os\nos.chdir(${JSON.stringify(outputDir)})\n${patchedCode}`;
  await fs.writeFile(scriptPath, wrappedCode, 'utf8');

  const { stdout, stderr } = await runWithTimeout('python3', [scriptPath, ...args], {
    cwd: sessionDir,
    timeout: EXEC_TIMEOUT_MS,
    onOutput,
  });

  const files = [];
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile()) {
        const fp = path.join(outputDir, ent.name);
        const buf = await fs.readFile(fp);
        if (buf.length <= 50 * 1024 * 1024) {
          files.push({ name: ent.name, buffer: buf });
        }
      }
    }
  } catch (e) {
    logger.warn('[LocalCodeExecution] Error reading output files:', e);
  }

  return {
    session_id,
    stdout: truncateOutput(stdout, MAX_OUTPUT_BYTES),
    stderr: truncateOutput(stderr, MAX_OUTPUT_BYTES),
    files,
  };
}

function truncateOutput(str, max) {
  if (Buffer.byteLength(str, 'utf8') <= max) return str;
  return str.slice(0, Math.floor(max / 2)) + '\n[... output truncated ...]\n';
}

function runWithTimeout(cmd, args, opts) {
  const onOutput = opts?.onOutput;
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    const chunks = { out: [], err: [] };
    proc.stdout?.on('data', (c) => {
      chunks.out.push(c);
      if (typeof onOutput === 'function') {
        onOutput({ source: 'stdout', chunk: c.toString('utf8') });
      }
    });
    proc.stderr?.on('data', (c) => {
      chunks.err.push(c);
      if (typeof onOutput === 'function') {
        onOutput({ source: 'stderr', chunk: c.toString('utf8') });
      }
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Execution timed out'));
    }, opts.timeout ?? EXEC_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(chunks.out).toString('utf8');
      const stderr = Buffer.concat(chunks.err).toString('utf8');
      if (code !== 0 && code != null && !signal) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

module.exports = {
  runCodeLocally,
  imageExtRegex,
  getSessionBaseDir,
  injectAgentFiles,
};
