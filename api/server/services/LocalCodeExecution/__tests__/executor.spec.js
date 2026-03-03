/**
 * Tests for local code execution. Run: npm test -- executor.spec.js
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/Files/strategies', () => {
  const { Readable } = require('stream');
  return {
    getStrategyFunctions: jest.fn(() => ({
      getDownloadStream: jest.fn(() => {
        const stream = new Readable({ read() {} });
        stream.push('overwrite content from agent attachment');
        stream.push(null);
        return Promise.resolve(stream);
      }),
    })),
  };
});

let realInjectAgentFiles;
jest.mock('../executor', () => {
  const actual = jest.requireActual('../executor');
  realInjectAgentFiles = actual.injectAgentFiles;
  return {
    ...actual,
    injectAgentFiles: jest.fn().mockResolvedValue(undefined),
  };
});

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

    it('should write files to workspace (not surfaced in result)', async () => {
      const code = 'with open("out.txt", "w") as f:\n  f.write("hello")';
      const r = await runCodeLocally({ lang: 'py', code });
      expect(r.files).toEqual([]);
      const sessionDir = path.join(getSessionBaseDir(), r.session_id);
      const content = await fs.readFile(path.join(sessionDir, 'out.txt'), 'utf8');
      expect(content).toBe('hello');
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should redirect /mnt/data/ paths to workspace dir', async () => {
      const code = 'with open("/mnt/data/x.txt", "w") as f:\n  f.write("from mnt data")';
      const r = await runCodeLocally({ lang: 'py', code });
      expect(r.files).toEqual([]);
      const sessionDir = path.join(getSessionBaseDir(), r.session_id);
      const content = await fs.readFile(path.join(sessionDir, 'x.txt'), 'utf8');
      expect(content).toBe('from mnt data');
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should redirect /mnt/data (no trailing slash) in os.path.join', async () => {
      const code = `
import os
p = os.path.join("/mnt/data", "y.txt")
with open(p, "w") as f:
  f.write("joined")
`;
      const r = await runCodeLocally({ lang: 'py', code });
      expect(r.files).toEqual([]);
      const sessionDir = path.join(getSessionBaseDir(), r.session_id);
      const content = await fs.readFile(path.join(sessionDir, 'y.txt'), 'utf8');
      expect(content).toBe('joined');
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
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
        expect(r1.files).toEqual([]);

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
        expect(r2.files).toEqual([]);
        const sessionDir = path.join(getSessionBaseDir(), session_id);
        const content = await fs.readFile(path.join(sessionDir, 'persist.txt'), 'utf8');
        expect(content).toBe('from run 1 + run 2');
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
    it('should return ToolMessage with artifact (no files surfaced)', async () => {
      const testTool = createLocalCodeExecutionTool({ files: [] });
      const code = 'with open("x.txt", "w") as f:\n  f.write("ok")';
      const result = await testTool.invoke(
        { lang: 'py', code },
        { toolCall: { id: 'tc-1' } }
      );
      expect(result.content).toBeDefined();
      expect(result.artifact).toBeDefined();
      expect(result.artifact.session_id).toBeDefined();
      expect(result.artifact.files).toBeUndefined();
      if (result.artifact.session_id) {
        const sessionDir = path.join(getSessionBaseDir(), result.artifact.session_id);
        const content = await fs.readFile(path.join(sessionDir, 'x.txt'), 'utf8');
        expect(content).toBe('ok');
        await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('should persist files across conversations when agentId and userId are provided', async () => {
      const agentId = 'agent-test-123';
      const userId = 'user-test-456';
      const testTool = createLocalCodeExecutionTool({
        agentId,
        user_id: userId,
        files: [],
      });
      const expectedSessionId = `agent_${agentId}_user_${userId}`;
      try {
        const result1 = await testTool.invoke(
          { lang: 'py', code: 'with open("cross_conv.txt", "w") as f:\n  f.write("from conv A")' },
          { toolCall: { id: 'tc-a' }, configurable: { thread_id: 'conv-aaa' } }
        );
        expect(result1.artifact.session_id).toBe(expectedSessionId);
        expect(result1.artifact.files).toBeUndefined();

        const result2 = await testTool.invoke(
          {
            lang: 'py',
            code: `
with open("cross_conv.txt", "r") as f:
  content = f.read()
with open("cross_conv.txt", "w") as f:
  f.write(content + " + conv B")
print("done")
`,
          },
          { toolCall: { id: 'tc-b' }, configurable: { thread_id: 'conv-bbb' } }
        );
        expect(result2.artifact.session_id).toBe(expectedSessionId);
        expect(result2.content).toContain('done');
        expect(result2.artifact.files).toBeUndefined();
        const sessionDir = path.join(getSessionBaseDir(), expectedSessionId);
        const content = await fs.readFile(path.join(sessionDir, 'cross_conv.txt'), 'utf8');
        expect(content).toBe('from conv A + conv B');
      } finally {
        const sessionDir = path.join(getSessionBaseDir(), expectedSessionId);
        await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe('injectAgentFiles', () => {
    it('should skip copying when file already exists (agent edits preserved)', async () => {
      const workspaceDir = path.join(
        os.tmpdir(),
        `inject_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      );
      await fs.mkdir(workspaceDir, { recursive: true });
      try {
        const existingContent = 'agent edited content - 23 categories';
        const destPath = path.join(workspaceDir, 'parse_transactions.py');
        await fs.writeFile(destPath, existingContent, 'utf8');

        await realInjectAgentFiles(
          workspaceDir,
          [
            {
              filename: 'parse_transactions.py',
              filepath: '/uploads/some/path',
              source: 'local',
            },
          ],
          {},
        );

        const content = await fs.readFile(destPath, 'utf8');
        expect(content).toBe(existingContent);
        expect(content).not.toContain('overwrite content from agent attachment');
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('should copy file when it does not exist', async () => {
      const workspaceDir = path.join(
        os.tmpdir(),
        `inject_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      );
      await fs.mkdir(workspaceDir, { recursive: true });
      try {
        await realInjectAgentFiles(
          workspaceDir,
          [
            {
              filename: 'new_file.py',
              filepath: '/uploads/some/path',
              source: 'local',
            },
          ],
          {},
        );

        const destPath = path.join(workspaceDir, 'new_file.py');
        const content = await fs.readFile(destPath, 'utf8');
        expect(content).toContain('overwrite content from agent attachment');
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
