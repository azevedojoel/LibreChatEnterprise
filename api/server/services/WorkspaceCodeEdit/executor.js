/**
 * Workspace file editing: read, search-replace edit, create.
 * All paths are relative to workspace_root. Path traversal (../) is rejected.
 */
const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

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
    const content = await fs.readFile(absPath, 'utf8');
    const count = (content.match(new RegExp(escapeRegex(old_string), 'g')) || []).length;
    if (count === 0) {
      return { error: 'old_string not found in file' };
    }
    if (count > 1) {
      return { error: 'old_string matched more than once; use a more specific match' };
    }
    const newContent = content.replace(old_string, new_string);
    await fs.writeFile(absPath, newContent, 'utf8');
    return { success: true };
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
 * @returns {Promise<{ success: true } | { error: string }>}
 */
async function createFile({ workspaceRoot, relativePath, content }) {
  try {
    const absPath = resolvePath(workspaceRoot, relativePath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf8');
    return { success: true };
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

module.exports = { readFile, editFile, createFile, deleteFile, listFiles, globFiles, searchFiles };
