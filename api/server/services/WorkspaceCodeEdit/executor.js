/**
 * Workspace file editing: read, search-replace edit, create.
 * All paths are relative to workspace_root. Path traversal (../) is rejected.
 */
const fs = require('fs').promises;
const path = require('path');
const { computeUnifiedDiff, truncateDiff } = require('./diffUtils');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream').promises;
const { glob } = require('glob');
const { getFiles } = require('~/models');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { FileSources } = require('librechat-data-provider');

/**
 * Normalizes paths that use /mnt/data convention (from execute_code) to relative paths.
 * Models often use /mnt/data/ for file paths; workspace tools expect paths relative to root.
 */
function normalizePath(relativePath) {
  if (typeof relativePath !== 'string') {
    return relativePath;
  }
  const trimmed = relativePath.trim();
  if (trimmed.startsWith('/mnt/data/')) {
    return trimmed.slice('/mnt/data/'.length) || '.';
  }
  if (trimmed === '/mnt/data') {
    return '.';
  }
  return relativePath;
}

/**
 * Validates that resolvedPath is inside workspaceRoot.
 * @param {string} workspaceRoot - Absolute path to workspace
 * @param {string} relativePath - User-provided relative path
 * @returns {string} Absolute path
 * @throws {Error} If path escapes workspace
 */
function resolvePath(workspaceRoot, relativePath) {
  const normalized = normalizePath(relativePath);
  const normalizedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(normalizedRoot, normalized);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path "${relativePath}" escapes workspace`);
  }
  return resolved;
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 * @param {string} params.relativePath - Path relative to workspace
 * @param {number} [params.startLine] - 1-based start line (inclusive)
 * @param {number} [params.endLine] - 1-based end line (inclusive)
 * @returns {Promise<{ content: string } | { error: string }>}
 */
async function readFile({ workspaceRoot, relativePath, startLine, endLine }) {
  try {
    const absPath = resolvePath(workspaceRoot, relativePath);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return { error: `"${relativePath}" is not a file` };
    }
    if (startLine != null || endLine != null) {
      if (
        (startLine != null && (!Number.isInteger(startLine) || startLine < 1)) ||
        (endLine != null && (!Number.isInteger(endLine) || endLine < 1))
      ) {
        return { error: 'start_line and end_line must be positive integers (1-based)' };
      }
    }
    let content = await fs.readFile(absPath, 'utf8');
    if (startLine != null || endLine != null) {
      if (startLine != null && endLine != null && startLine > endLine) {
        return { error: 'start_line must be less than or equal to end_line' };
      }
      const lines = content.split(/\r?\n/);
      const start = startLine != null ? Math.max(1, Math.min(startLine, lines.length)) - 1 : 0;
      const end =
        endLine != null ? Math.max(start, Math.min(endLine, lines.length) - 1) : lines.length - 1;
      content = lines.slice(start, end + 1).join('\n');
    }
    const parsed = process.env.READ_FILE_MAX_LINES
      ? parseInt(process.env.READ_FILE_MAX_LINES, 10)
      : 500;
    const maxLines = Number.isInteger(parsed) && parsed > 0 ? parsed : 500;
    const lines = content.split(/\r?\n/);
    if (lines.length > maxLines) {
      const omitted = lines.length - maxLines;
      content = lines.slice(0, maxLines).join('\n') + `\n(${omitted} more lines)`;
    }
    return { content };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `File "${relativePath}" not found` };
    }
    return { error: err.message };
  }
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot
 * @param {string} params.relativePath
 * @param {string} params.old_string - Exact substring to replace
 * @param {string} params.new_string - Replacement
 * @returns {Promise<{ success: true } | { error: string }>}
 */
/**
 * Normalizes line endings to \n for consistent matching (handles CRLF, CR, LF).
 */
function normalizeLineEndings(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Escapes $ in replacement strings so they are treated as literal, not special patterns.
 * In String.replace, $$ produces one $. When we call str.replace(/\$/g, '$$'), the
 * inner replace processes '$$' to '$', so we get no escape. We need '$$$$' so the
 * inner replace outputs '$$', which then produces one $ in the outer replace.
 */
function escapeReplacementString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\$/g, '$$$$');
}

async function editFile({ workspaceRoot, relativePath, old_string, new_string }) {
  try {
    if (typeof old_string !== 'string' || old_string === '') {
      return { error: 'old_string must be a non-empty string' };
    }
    const absPath = resolvePath(workspaceRoot, relativePath);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return { error: `"${relativePath}" is not a file` };
    }
    const rawContent = await fs.readFile(absPath, 'utf8');
    const content = normalizeLineEndings(rawContent);
    const normalizedOld = normalizeLineEndings(old_string);
    const count = (content.match(new RegExp(escapeRegex(normalizedOld), 'g')) || []).length;
    if (count === 0) {
      return { error: 'old_string not found in file' };
    }
    if (count > 1) {
      return { error: 'old_string matched more than once; use a more specific match' };
    }
    const escapedNew = escapeReplacementString(new_string ?? '');
    const newContent = content.replace(normalizedOld, escapedNew);
    await fs.writeFile(absPath, newContent, 'utf8');
    const fullDiff = computeUnifiedDiff(relativePath, content, newContent);
    const { diff, truncated, totalLines } = truncateDiff(fullDiff);
    const summary = `Edited ${relativePath}`;
    return { success: true, diff, file: relativePath, summary, truncated, totalLines };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `File "${relativePath}" not found` };
    }
    return { error: err.message };
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot
 * @param {string} params.relativePath
 * @param {string} params.content
 * @returns {Promise<{ success: true, diff, file, summary, truncated, totalLines? } | { error: string }>}
 */
async function createFile({ workspaceRoot, relativePath, content }) {
  try {
    const absPath = resolvePath(workspaceRoot, relativePath);
    let oldContent = null;
    try {
      oldContent = await fs.readFile(absPath, 'utf8');
    } catch {
      // File does not exist
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf8');
    const isNewFile = oldContent == null;
    const summary = isNewFile ? `Created ${relativePath}` : `Created ${relativePath} (overwrite)`;
    if (isNewFile) {
      const fullDiff = computeUnifiedDiff(relativePath, null, content);
      const { diff, truncated, totalLines } = truncateDiff(fullDiff);
      const lineCount = content.split(/\r?\n/).length;
      return { success: true, diff, file: relativePath, summary: `${summary} (${lineCount} lines)`, truncated, totalLines };
    }
    const fullDiff = computeUnifiedDiff(relativePath, oldContent, content);
    const { diff, truncated, totalLines } = truncateDiff(fullDiff);
    return { success: true, diff, file: relativePath, summary, truncated, totalLines };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot
 * @param {string} params.relativePath
 * @returns {Promise<{ success: true } | { error: string }>}
 */
async function deleteFile({ workspaceRoot, relativePath }) {
  try {
    const absPath = resolvePath(workspaceRoot, relativePath);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return { error: `"${relativePath}" is not a file` };
    }
    await fs.unlink(absPath);
    return { success: true };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `File "${relativePath}" not found` };
    }
    return { error: err.message };
  }
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot
 * @param {string} params.relativePath - Directory path (default ".")
 * @param {string} [params.extension] - Filter by extension (e.g. "py")
 * @returns {Promise<{ entries: Array<{ name: string; type: 'file'|'dir' }> } | { error: string }>}
 */
async function listFiles({ workspaceRoot, relativePath = '.', extension }) {
  try {
    const absPath = resolvePath(workspaceRoot, relativePath);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch (err) {
      if (err.code === 'ENOENT' && (relativePath === '.' || relativePath === '')) {
        return { entries: [] };
      }
      throw err;
    }
    if (!stat.isDirectory()) {
      return { error: `"${relativePath}" is not a directory` };
    }
    const names = await fs.readdir(absPath);
    const entries = [];
    const extLower = extension?.toLowerCase().replace(/^\./, '');
    for (const name of names) {
      const fullPath = path.join(absPath, name);
      const s = await fs.stat(fullPath);
      const type = s.isDirectory() ? 'dir' : 'file';
      if (extLower && type === 'file') {
        if (!name.toLowerCase().endsWith(`.${extLower}`)) continue;
      }
      entries.push({ name, type });
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { entries };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `Directory "${relativePath}" not found` };
    }
    return { error: err.message };
  }
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot
 * @param {string} params.pattern - Glob pattern (e.g. "*.py", "src/**\/*.ts")
 * @param {string} [params.relativePath='.'] - Directory to search (relative to workspace)
 * @param {number} [params.maxResults=200] - Max files to return
 * @returns {Promise<{ paths: string[] } | { error: string }>}
 */
async function globFiles({ workspaceRoot, pattern, relativePath = '.', maxResults = 200 }) {
  try {
    const absPath = resolvePath(workspaceRoot, relativePath);
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) {
      return { error: `"${relativePath}" is not a directory` };
    }
    const matches = await glob(pattern, {
      cwd: absPath,
      nodir: true,
      withFileTypes: false,
    });
    const relPrefix = path.resolve(workspaceRoot);
    const paths = matches
      .slice(0, maxResults)
      .map((p) => path.relative(relPrefix, path.resolve(absPath, p)))
      .filter((p) => !p.startsWith('..') && p !== '');
    return { paths };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `"${relativePath}" not found` };
    }
    return { error: err.message };
  }
}

/**
 * @param {object} params
 * @param {string} params.workspaceRoot
 * @param {string} params.pattern - Search pattern (literal or regex when useRegex)
 * @param {string} [params.relativePath] - Directory or file to search (default ".")
 * @param {string} [params.extension] - Filter by extension (e.g. "py")
 * @param {number} [params.maxResults=50] - Max matches to return
 * @param {boolean} [params.useRegex=false] - Treat pattern as regex
 * @param {number} [params.contextLines=0] - Lines before/after each match
 * @param {boolean} [params.caseSensitive=true] - Case-sensitive match
 * @returns {Promise<{ matches: Array<{ path: string; line: number; content: string; contextBefore?: string[]; contextAfter?: string[] }> } | { error: string }>}
 */
async function searchFiles({
  workspaceRoot,
  pattern,
  relativePath = '.',
  extension,
  maxResults = 50,
  useRegex = false,
  contextLines = 0,
  caseSensitive = true,
}) {
  try {
    let regex;
    if (useRegex) {
      try {
        regex = new RegExp(pattern, caseSensitive ? '' : 'i');
      } catch (e) {
        return { error: `Invalid regex: ${e.message}` };
      }
    }

    const absPath = resolvePath(workspaceRoot, relativePath);
    const stat = await fs.stat(absPath);
    const extLower = extension?.toLowerCase().replace(/^\./, '');

    const collectPaths = async (dir) => {
      const paths = [];
      const names = await fs.readdir(dir);
      for (const name of names) {
        const full = path.join(dir, name);
        const s = await fs.stat(full);
        if (s.isDirectory()) {
          paths.push(...(await collectPaths(full)));
        } else if (s.isFile() && (!extLower || name.toLowerCase().endsWith(`.${extLower}`))) {
          paths.push(full);
        }
      }
      return paths;
    };

    let filePaths = [];
    if (stat.isFile()) {
      if (extLower && !path.basename(absPath).toLowerCase().endsWith(`.${extLower}`)) {
        return { matches: [] };
      }
      filePaths = [absPath];
    } else {
      filePaths = await collectPaths(absPath);
    }

    const matches = [];
    const relPrefix = path.resolve(workspaceRoot);
    const test = (line) =>
      useRegex ? regex.test(line) : (caseSensitive ? line.includes(pattern) : line.toLowerCase().includes(pattern.toLowerCase()));

    for (const fp of filePaths) {
      if (matches.length >= maxResults) break;
      try {
        const content = await fs.readFile(fp, 'utf8');
        const lines = content.split(/\r?\n/);
        const relPath = path.relative(relPrefix, fp);
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          if (test(lines[i])) {
            const match = { path: relPath, line: i + 1, content: lines[i].trim() };
            if (contextLines > 0) {
              const start = Math.max(0, i - contextLines);
              const end = Math.min(lines.length - 1, i + contextLines);
              match.contextBefore = start < i ? lines.slice(start, i).map((l) => l.trim()) : undefined;
              match.contextAfter = end > i ? lines.slice(i + 1, end + 1).map((l) => l.trim()) : undefined;
            }
            matches.push(match);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
    return { matches };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `"${relativePath}" not found` };
    }
    return { error: err.message };
  }
}

const SEND_FILE_MAX_BYTES =
  parseInt(process.env.LIBRECHAT_SEND_FILE_MAX_BYTES, 10) || 10 * 1024 * 1024; // 10MB default

/**
 * Read files from workspace and return buffers for artifact delivery.
 * Validates all paths exist before reading; returns a comprehensive error listing any missing files.
 * @param {object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 * @param {string[]} params.paths - File paths relative to workspace root
 * @returns {Promise<{ files: Array<{ name: string; buffer: Buffer }> } | { error: string }>}
 */
async function sendFilesToUser({ workspaceRoot, paths }) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { error: 'paths must be a non-empty array' };
  }
  const validPaths = [];
  const missingPaths = [];
  const otherErrors = [];

  for (const relativePath of paths) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      return { error: 'Each path must be a non-empty string' };
    }
    const trimmed = relativePath.trim();
    try {
      const absPath = resolvePath(workspaceRoot, trimmed);
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) {
        otherErrors.push(`"${trimmed}" is not a file (it may be a directory)`);
        continue;
      }
      if (stat.size > SEND_FILE_MAX_BYTES) {
        return {
          error: `"${trimmed}" exceeds maximum size (${Math.round(SEND_FILE_MAX_BYTES / 1024 / 1024)}MB)`,
        };
      }
      validPaths.push(trimmed);
    } catch (err) {
      if (err.code === 'ENOENT') {
        missingPaths.push(trimmed);
      } else if (err.message?.includes('escapes workspace')) {
        return { error: err.message };
      } else {
        otherErrors.push(`"${trimmed}": ${err.message}`);
      }
    }
  }

  if (missingPaths.length > 0) {
    const fileWord = missingPaths.length === 1 ? 'File' : 'Files';
    const list = missingPaths.map((p) => `"${p}"`).join(', ');
    return {
      error: `${fileWord} not found: ${list}. Please verify the paths are correct and the files were created.`,
    };
  }
  if (otherErrors.length > 0) {
    return { error: otherErrors.join('; ') };
  }

  const files = [];
  for (const trimmed of validPaths) {
    const absPath = resolvePath(workspaceRoot, trimmed);
    const buffer = await fs.readFile(absPath);
    files.push({ name: trimmed, buffer });
  }
  return { files };
}

/**
 * Copy a file from the user's My Files into the workspace.
 * Uses same copy logic as injectAgentFiles. Skips if file already exists in workspace.
 * @param {object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 * @param {string} params.file_id - File ID from file_search or My Files
 * @param {import('express').Request} params.req - Request for storage streaming
 * @param {string} params.userId - User ID for access check
 * @param {string} [params.agentId] - Agent ID for access check
 * @param {string} [params.role] - User role for access check
 * @returns {Promise<{ filename: string } | { error: string }>}
 */
/**
 * List user's My Files by optional filename filter. No embeddings—direct DB lookup.
 * @param {string} userId
 * @param {string} [filenameFilter] - Optional: partial match (case-insensitive). Omit for recent files.
 * @param {string} [agentId]
 * @param {string} [role]
 * @returns {Promise<Array<{ file_id: string; filename: string }>>}
 */
async function listMyFiles({ userId, filenameFilter, agentId, role }) {
  if (!userId) return [];
  const filter = { user: userId };
  if (filenameFilter && filenameFilter.trim()) {
    const escaped = filenameFilter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.filename = { $regex: escaped, $options: 'i' };
  }
  let files = (await getFiles(filter, null, { text: 0, filepath: 0 })) ?? [];
  if (agentId && files.length > 0) {
    const req = { user: { id: userId, role } };
    files = await filterFilesByAgentAccess({
      files,
      userId,
      role: role ?? 'USER',
      agentId,
    });
  }
  return files.slice(0, 50).map((f) => ({ file_id: f.file_id, filename: f.filename }));
}

async function pullFileToWorkspace({ workspaceRoot, file_id, filename, req, userId, agentId, role }) {
  let resolvedFileId = file_id;
  if (!resolvedFileId && filename && typeof filename === 'string' && filename.trim()) {
    const matches = await listMyFiles({
      userId,
      filenameFilter: filename.trim(),
      agentId,
      role: role ?? req?.user?.role,
    });
    const exact = matches.find((m) => m.filename === filename.trim());
    resolvedFileId = exact?.file_id ?? matches[0]?.file_id;
  }
  if (!resolvedFileId || typeof resolvedFileId !== 'string') {
    return { error: 'file_id or filename is required' };
  }
  if (!req) {
    return { error: 'Request context required for file access' };
  }
  if (!userId || !agentId) {
    return { error: 'User and agent context required for file access' };
  }
  const allFiles = (await getFiles({ file_id: resolvedFileId }, null, { text: 0 })) ?? [];
  const dbFiles = await filterFilesByAgentAccess({
    files: allFiles,
    userId,
    role: role ?? req.user?.role,
    agentId,
  });
  const file = dbFiles[0];
  if (!file || !file.filename || !file.filepath) {
    return { error: 'File not found or access denied.' };
  }
  await fs.mkdir(workspaceRoot, { recursive: true });
  const dest = path.join(workspaceRoot, path.basename(file.filename));
  const stat = await fs.stat(dest).catch(() => null);
  if (stat?.isFile()) {
    return { filename: path.basename(file.filename) };
  }
  try {
    const source = file.source ?? FileSources.local;
    const { getDownloadStream } = getStrategyFunctions(source);
    if (!getDownloadStream) {
      return { error: 'File storage does not support streaming' };
    }
    const readStream = await getDownloadStream(req, file.filepath);
    const writeStream = createWriteStream(dest);
    await pipeline(readStream, writeStream);
    return { filename: path.basename(file.filename) };
  } catch (err) {
    return { error: `Failed to copy file: ${err.message}` };
  }
}

module.exports = {
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
};
