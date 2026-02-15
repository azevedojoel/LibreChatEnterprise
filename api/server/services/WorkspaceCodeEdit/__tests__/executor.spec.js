/**
 * Tests for WorkspaceCodeEdit executor. Run: npm test -- executor.spec.js
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
  readFile,
  editFile,
  createFile,
  deleteFile,
  listFiles,
  globFiles,
  searchFiles,
} = require('../executor');

describe('WorkspaceCodeEdit', () => {
  let workspaceRoot;

  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `workspace_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  });

  describe('readFile', () => {
    it('should read file contents', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'hello world', 'utf8');
      const r = await readFile({ workspaceRoot, relativePath: 'a.txt' });
      expect(r.content).toBe('hello world');
    });

    it('should return error for missing file', async () => {
      const r = await readFile({ workspaceRoot, relativePath: 'missing.txt' });
      expect(r.error).toContain('not found');
    });

    it('should return error when path escapes workspace', async () => {
      const r = await readFile({ workspaceRoot, relativePath: '../etc/passwd' });
      expect(r.error).toContain('escapes workspace');
    });

    it('should return error for directory', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'dir'), { recursive: true });
      const r = await readFile({ workspaceRoot, relativePath: 'dir' });
      expect(r.error).toContain('not a file');
    });

    it('should read line range with start_line and end_line', async () => {
      await fs.writeFile(
        path.join(workspaceRoot, 'lines.txt'),
        'L1\nL2\nL3\nL4\nL5',
        'utf8',
      );
      const r = await readFile({
        workspaceRoot,
        relativePath: 'lines.txt',
        startLine: 2,
        endLine: 4,
      });
      expect(r.content).toBe('L2\nL3\nL4');
    });

    it('should return error when start_line > end_line', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'x', 'utf8');
      const r = await readFile({
        workspaceRoot,
        relativePath: 'a.txt',
        startLine: 3,
        endLine: 1,
      });
      expect(r.error).toContain('start_line');
    });

    it('should read from start_line to end when only start_line provided', async () => {
      await fs.writeFile(
        path.join(workspaceRoot, 'lines.txt'),
        'L1\nL2\nL3\nL4\nL5',
        'utf8',
      );
      const r = await readFile({
        workspaceRoot,
        relativePath: 'lines.txt',
        startLine: 4,
      });
      expect(r.content).toBe('L4\nL5');
    });

    it('should read from start to end_line when only end_line provided', async () => {
      await fs.writeFile(
        path.join(workspaceRoot, 'lines.txt'),
        'L1\nL2\nL3\nL4\nL5',
        'utf8',
      );
      const r = await readFile({
        workspaceRoot,
        relativePath: 'lines.txt',
        endLine: 2,
      });
      expect(r.content).toBe('L1\nL2');
    });

    it('should return error for invalid start_line or end_line', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'x', 'utf8');
      const r1 = await readFile({
        workspaceRoot,
        relativePath: 'a.txt',
        startLine: 0,
        endLine: 1,
      });
      expect(r1.error).toContain('positive integers');
      const r2 = await readFile({
        workspaceRoot,
        relativePath: 'a.txt',
        startLine: 2.5,
        endLine: 3,
      });
      expect(r2.error).toContain('positive integers');
    });
  });

  describe('editFile', () => {
    it('should replace old_string with new_string', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'b.txt'), 'foo\nbar\nbaz', 'utf8');
      const r = await editFile({
        workspaceRoot,
        relativePath: 'b.txt',
        old_string: 'bar',
        new_string: 'qux',
      });
      expect(r.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'b.txt'), 'utf8');
      expect(content).toBe('foo\nqux\nbaz');
    });

    it('should return error when old_string not found', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'c.txt'), 'hello', 'utf8');
      const r = await editFile({
        workspaceRoot,
        relativePath: 'c.txt',
        old_string: 'xyz',
        new_string: 'replacement',
      });
      expect(r.error).toContain('not found');
    });

    it('should return error when old_string matches multiple times', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'd.txt'), 'aa\nbb\naa', 'utf8');
      const r = await editFile({
        workspaceRoot,
        relativePath: 'd.txt',
        old_string: 'aa',
        new_string: 'xx',
      });
      expect(r.error).toContain('more than once');
    });

    it('should return error when old_string is empty', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'e.txt'), 'hello', 'utf8');
      const r = await editFile({
        workspaceRoot,
        relativePath: 'e.txt',
        old_string: '',
        new_string: 'x',
      });
      expect(r.error).toContain('non-empty');
    });
  });

  describe('createFile', () => {
    it('should create file with content', async () => {
      const r = await createFile({
        workspaceRoot,
        relativePath: 'new.txt',
        content: 'created content',
      });
      expect(r.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'new.txt'), 'utf8');
      expect(content).toBe('created content');
    });

    it('should create parent directories', async () => {
      const r = await createFile({
        workspaceRoot,
        relativePath: 'sub/dir/file.txt',
        content: 'nested',
      });
      expect(r.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'sub/dir/file.txt'), 'utf8');
      expect(content).toBe('nested');
    });

    it('should overwrite existing file', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'existing.txt'), 'old', 'utf8');
      const r = await createFile({
        workspaceRoot,
        relativePath: 'existing.txt',
        content: 'new',
      });
      expect(r.success).toBe(true);
      const content = await fs.readFile(path.join(workspaceRoot, 'existing.txt'), 'utf8');
      expect(content).toBe('new');
    });

    it('should reject path traversal', async () => {
      const r = await createFile({
        workspaceRoot,
        relativePath: '../../../etc/pwned',
        content: 'hack',
      });
      expect(r.error).toContain('escapes workspace');
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'to_delete.txt'), 'content', 'utf8');
      const r = await deleteFile({ workspaceRoot, relativePath: 'to_delete.txt' });
      expect(r.success).toBe(true);
      await expect(fs.stat(path.join(workspaceRoot, 'to_delete.txt'))).rejects.toThrow();
    });

    it('should return error for missing file', async () => {
      const r = await deleteFile({ workspaceRoot, relativePath: 'missing.txt' });
      expect(r.error).toContain('not found');
    });

    it('should return error when path escapes workspace', async () => {
      const r = await deleteFile({ workspaceRoot, relativePath: '../etc/passwd' });
      expect(r.error).toContain('escapes workspace');
    });

    it('should return error for directory', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'dir'), { recursive: true });
      const r = await deleteFile({ workspaceRoot, relativePath: 'dir' });
      expect(r.error).toContain('not a file');
    });
  });

  describe('listFiles', () => {
    it('should list files and directories', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.py'), 'x', 'utf8');
      await fs.writeFile(path.join(workspaceRoot, 'b.txt'), 'y', 'utf8');
      await fs.mkdir(path.join(workspaceRoot, 'subdir'), { recursive: true });
      const r = await listFiles({ workspaceRoot, relativePath: '.' });
      expect(r.entries).toBeDefined();
      expect(r.entries.length).toBe(3);
      const names = r.entries.map((e) => e.name).sort();
      expect(names).toEqual(['a.py', 'b.txt', 'subdir']);
    });

    it('should filter by extension', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.py'), 'x', 'utf8');
      await fs.writeFile(path.join(workspaceRoot, 'b.txt'), 'y', 'utf8');
      const r = await listFiles({ workspaceRoot, relativePath: '.', extension: 'py' });
      expect(r.entries.length).toBe(1);
      expect(r.entries[0].name).toBe('a.py');
    });

    it('should return error for non-directory', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'f.txt'), 'x', 'utf8');
      const r = await listFiles({ workspaceRoot, relativePath: 'f.txt' });
      expect(r.error).toContain('not a directory');
    });
  });

  describe('globFiles', () => {
    it('should find files matching glob pattern', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.py'), 'x', 'utf8');
      await fs.writeFile(path.join(workspaceRoot, 'b.py'), 'y', 'utf8');
      await fs.writeFile(path.join(workspaceRoot, 'c.txt'), 'z', 'utf8');
      const r = await globFiles({ workspaceRoot, pattern: '*.py', relativePath: '.' });
      expect(r.paths).toBeDefined();
      expect(r.paths.length).toBe(2);
      expect(r.paths.sort()).toEqual(['a.py', 'b.py']);
    });

    it('should find files in subdirectory with **', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
      await fs.writeFile(path.join(workspaceRoot, 'src', 'index.ts'), 'x', 'utf8');
      const r = await globFiles({ workspaceRoot, pattern: '**/*.ts', relativePath: '.' });
      expect(r.paths.length).toBe(1);
      expect(r.paths[0]).toBe('src/index.ts');
    });

    it('should return error for non-directory', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'f.txt'), 'x', 'utf8');
      const r = await globFiles({ workspaceRoot, pattern: '*', relativePath: 'f.txt' });
      expect(r.error).toContain('not a directory');
    });

    it('should respect maxResults', async () => {
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(workspaceRoot, `f${i}.txt`), 'x', 'utf8');
      }
      const r = await globFiles({ workspaceRoot, pattern: '*.txt', relativePath: '.', maxResults: 3 });
      expect(r.paths.length).toBe(3);
    });

    it('should return empty paths for pattern with no matches', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.py'), 'x', 'utf8');
      const r = await globFiles({ workspaceRoot, pattern: '*.nonexistent', relativePath: '.' });
      expect(r.paths).toEqual([]);
    });
  });

  describe('searchFiles', () => {
    it('should find pattern in files', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.py'), 'def foo():\n  pass', 'utf8');
      await fs.writeFile(path.join(workspaceRoot, 'b.py'), 'def bar():\n  foo()', 'utf8');
      const r = await searchFiles({ workspaceRoot, pattern: 'foo', relativePath: '.' });
      expect(r.matches.length).toBe(2);
    });

    it('should filter by extension', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.py'), 'x = 1', 'utf8');
      await fs.writeFile(path.join(workspaceRoot, 'b.txt'), 'x = 1', 'utf8');
      const r = await searchFiles({
        workspaceRoot,
        pattern: 'x',
        relativePath: '.',
        extension: 'py',
      });
      expect(r.matches.length).toBe(1);
      expect(r.matches[0].path).toBe('a.py');
    });

    it('should support regex with useRegex', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'foo123\nbar456\nbaz', 'utf8');
      const r = await searchFiles({
        workspaceRoot,
        pattern: '\\d{3}',
        relativePath: '.',
        useRegex: true,
      });
      expect(r.matches.length).toBe(2);
    });

    it('should support case-insensitive search', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'FOO\nbar\nBar', 'utf8');
      const r = await searchFiles({
        workspaceRoot,
        pattern: 'bar',
        relativePath: '.',
        caseSensitive: false,
      });
      expect(r.matches.length).toBe(2);
    });

    it('should include context lines when contextLines > 0', async () => {
      await fs.writeFile(
        path.join(workspaceRoot, 'a.txt'),
        'line1\nline2\nline3 MATCH\nline4\nline5',
        'utf8',
      );
      const r = await searchFiles({
        workspaceRoot,
        pattern: 'MATCH',
        relativePath: '.',
        contextLines: 1,
      });
      expect(r.matches.length).toBe(1);
      expect(r.matches[0].contextBefore).toEqual(['line2']);
      expect(r.matches[0].contextAfter).toEqual(['line4']);
    });

    it('should return error for invalid regex', async () => {
      const r = await searchFiles({
        workspaceRoot,
        pattern: '[invalid',
        relativePath: '.',
        useRegex: true,
      });
      expect(r.error).toContain('Invalid regex');
    });

    it('should omit contextBefore when match at first line', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'MATCH first\nline2\nline3', 'utf8');
      const r = await searchFiles({
        workspaceRoot,
        pattern: 'MATCH',
        relativePath: '.',
        contextLines: 1,
      });
      expect(r.matches.length).toBe(1);
      expect(r.matches[0].contextBefore).toBeUndefined();
      expect(r.matches[0].contextAfter).toEqual(['line2']);
    });

    it('should omit contextAfter when match at last line', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'line1\nline2\nMATCH last', 'utf8');
      const r = await searchFiles({
        workspaceRoot,
        pattern: 'MATCH',
        relativePath: '.',
        contextLines: 1,
      });
      expect(r.matches.length).toBe(1);
      expect(r.matches[0].contextBefore).toEqual(['line2']);
      expect(r.matches[0].contextAfter).toBeUndefined();
    });
  });
});
