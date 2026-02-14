/**
 * Tests for local code execution. Run: npm test -- executor.spec.js
 */
const fs = require('fs').promises;
const path = require('path');
const { runCodeLocally, getSessionBaseDir } = require('../executor');
const { createLocalCodeExecutionTool } = require('../tool');

describe('LocalCodeExecution', () => {
  describe('runCodeLocally', () => {
    it('should execute Python and return stdout', async () => {
      const r = await runCodeLocally({ lang: 'py', code: 'print(2 + 2)' });
      expect(r.stdout).toContain('4');
      expect(r.session_id).toMatch(/^local_/);
      expect(r.files).toEqual([]);
    });

    it('should capture file output', async () => {
      const code = 'with open("out.txt", "w") as f:\n  f.write("hello")';
      const r = await runCodeLocally({ lang: 'py', code });
      expect(r.files).toHaveLength(1);
      expect(r.files[0].name).toBe('out.txt');
      expect(r.files[0].buffer.toString()).toBe('hello');
    });

    it('should redirect /mnt/data/ paths to output dir', async () => {
      const code = 'with open("/mnt/data/x.txt", "w") as f:\n  f.write("from mnt data")';
      const r = await runCodeLocally({ lang: 'py', code });
      expect(r.files).toHaveLength(1);
      expect(r.files[0].name).toBe('x.txt');
      expect(r.files[0].buffer.toString()).toBe('from mnt data');
    });

    it('should redirect /mnt/data (no trailing slash) in os.path.join', async () => {
      const code = `
import os
p = os.path.join("/mnt/data", "y.txt")
with open(p, "w") as f:
  f.write("joined")
`;
      const r = await runCodeLocally({ lang: 'py', code });
      expect(r.files).toHaveLength(1);
      expect(r.files[0].name).toBe('y.txt');
      expect(r.files[0].buffer.toString()).toBe('joined');
    });

    it('should throw for non-Python', async () => {
      await expect(
        runCodeLocally({ lang: 'js', code: 'console.log(1)' })
      ).rejects.toThrow('Python only');
    });

    it('should persist files across runs when session_id is reused', async () => {
      const session_id = `local_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      try {
        const r1 = await runCodeLocally({
          lang: 'py',
          code: 'with open("/mnt/data/persist.txt", "w") as f:\n  f.write("from run 1")',
          session_id,
        });
        expect(r1.session_id).toBe(session_id);
        expect(r1.files).toHaveLength(1);
        expect(r1.files[0].buffer.toString()).toBe('from run 1');

        const r2 = await runCodeLocally({
          lang: 'py',
          code: `
with open("/mnt/data/persist.txt", "r") as f:
  content = f.read()
with open("/mnt/data/persist.txt", "w") as f:
  f.write(content + " + run 2")
print("done")
`,
          session_id,
        });
        expect(r2.session_id).toBe(session_id);
        expect(r2.stdout).toContain('done');
        expect(r2.files).toHaveLength(1);
        expect(r2.files[0].buffer.toString()).toBe('from run 1 + run 2');
      } finally {
        const sessionDir = path.join(getSessionBaseDir(), session_id);
        await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('should create session dir when session_id not provided', async () => {
      const r = await runCodeLocally({ lang: 'py', code: 'print(1)' });
      expect(r.session_id).toMatch(/^local_/);
      const sessionDir = path.join(getSessionBaseDir(), r.session_id);
      const stat = await fs.stat(sessionDir);
      expect(stat.isDirectory()).toBe(true);
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    });
  });

  describe('createLocalCodeExecutionTool', () => {
    it('should return ToolMessage with artifact when toolCall provided', async () => {
      const testTool = createLocalCodeExecutionTool({ files: [] });
      const code = 'with open("x.txt", "w") as f:\n  f.write("ok")';
      const result = await testTool.invoke(
        { lang: 'py', code },
        { toolCall: { id: 'tc-1' } }
      );
      expect(result.content).toBeDefined();
      expect(result.artifact).toBeDefined();
      expect(result.artifact.files).toHaveLength(1);
      expect(result.artifact.files[0].buffer.toString()).toBe('ok');
      if (result.artifact.session_id) {
        const sessionDir = path.join(getSessionBaseDir(), result.artifact.session_id);
        await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
