/**
 * Verifies the code download route was removed (CODE_API_KEY/E2B HTTP flow).
 * Code execution now runs locally - no external download endpoint.
 */

const express = require('express');
const request = require('supertest');

jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
  processFileUpload: jest.fn(),
  processDeleteRequest: jest.fn(),
  processAgentFileUpload: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({})),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3FileUrls: jest.fn(),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn().mockResolvedValue(false),
}));

jest.mock('~/server/middleware/accessResources/fileAccess', () => ({
  fileAccess: (req, res, next) => next(),
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn().mockResolvedValue([]),
  batchUpdateFiles: jest.fn(),
}));

jest.mock('~/models/Assistant', () => ({
  getAssistant: jest.fn(),
}));

jest.mock('~/models/Agent', () => ({
  getAgent: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const router = require('../files');

describe('File routes - code download removed', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'user-123', role: 'USER' };
      req.config = { fileStrategy: 'local', fileConfig: {} };
      next();
    });
    app.use('/', router);
    app.use((req, res) => res.status(404).send('Not Found'));
  });

  it('GET /code/download/:session_id/:fileId should return 404 (route removed - code runs locally)', async () => {
    const sessionId = '012345678901234567890';
    const fileId = '012345678901234567890';

    const res = await request(app)
      .get(`/code/download/${sessionId}/${fileId}`)
      .expect(404);

    expect(res.status).toBe(404);
  });
});
