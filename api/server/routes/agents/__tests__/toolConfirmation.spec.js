/**
 * Tests for tool confirmation API routes
 * GET /chat/tool-confirmation/pending - Fetch pending tool confirmation (approval page)
 * POST /chat/tool-confirmation - Submit approval/denial (token or inline flow)
 */

const express = require('express');
const request = require('supertest');

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockToolApprovalLink = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
};

const mockToolConfirmationStore = {
  submit: jest.fn(),
};

const mockSearchConversation = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn().mockReturnValue(false),
  GenerationJobManager: {
    getJob: jest.fn(),
    abortJob: jest.fn(),
    getActiveJobIdsForUser: jest.fn(),
  },
}));

jest.mock('~/server/middleware', () => ({
  uaParser: (req, res, next) => next(),
  checkBan: (req, res, next) => next(),
  requireJwtAuth: (req, res, next) => {
    req.user = { id: 'test-user-123' };
    next();
  },
  messageIpLimiter: (req, res, next) => next(),
  configMiddleware: (req, res, next) => next(),
  messageUserLimiter: (req, res, next) => next(),
}));

jest.mock('~/db/models', () => ({
  ToolApprovalLink: mockToolApprovalLink,
}));

jest.mock('~/server/services/ToolConfirmationStore', () => mockToolConfirmationStore);

jest.mock('~/models/Conversation', () => ({
  searchConversation: (...args) => mockSearchConversation(...args),
}));

jest.mock('~/server/routes/agents/chat', () => require('express').Router());
jest.mock('~/server/routes/agents/v1', () => ({
  v1: require('express').Router(),
}));
jest.mock('~/server/routes/agents/openai', () => require('express').Router());
jest.mock('~/server/routes/agents/responses', () => require('express').Router());

const agentRoutes = require('~/server/routes/agents/index');

describe('Tool Confirmation API Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /chat/tool-confirmation/pending', () => {
    it('should return 400 when missing id query param', async () => {
      const response = await request(app)
        .get('/api/agents/chat/tool-confirmation/pending')
        .query({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Missing required query params',
        required: ['id'],
      });
      expect(mockToolApprovalLink.findOne).not.toHaveBeenCalled();
    });

    it('should return 404 when link not found', async () => {
      mockToolApprovalLink.findOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/agents/chat/tool-confirmation/pending')
        .query({ id: 'invalid-token' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'expired' });
      expect(mockToolApprovalLink.findOne).toHaveBeenCalledWith({
        token: 'invalid-token',
        status: 'pending',
      });
    });

    it('should return 404 when link expired', async () => {
      mockToolApprovalLink.findOne.mockResolvedValue({
        _id: 'link-1',
        token: 'token-1',
        userId: 'test-user-123',
        expiresAt: new Date(Date.now() - 3600000),
        clickedAt: null,
      });

      const response = await request(app)
        .get('/api/agents/chat/tool-confirmation/pending')
        .query({ id: 'token-1' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'expired' });
    });

    it('should return 403 when link belongs to different user', async () => {
      mockToolApprovalLink.findOne.mockResolvedValue({
        _id: 'link-1',
        token: 'token-1',
        userId: 'other-user-456',
        expiresAt: new Date(Date.now() + 3600000),
        clickedAt: null,
      });

      const response = await request(app)
        .get('/api/agents/chat/tool-confirmation/pending')
        .query({ id: 'token-1' });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 200 with tool details when valid', async () => {
      const link = {
        _id: 'link-1',
        token: 'token-1',
        userId: 'test-user-123',
        toolName: 'execute_code',
        argsSummary: 'print(1)',
        conversationId: 'conv-1',
        expiresAt: new Date(Date.now() + 3600000),
        clickedAt: null,
      };
      mockToolApprovalLink.findOne.mockResolvedValue(link);
      mockToolApprovalLink.updateOne.mockResolvedValue({});

      const response = await request(app)
        .get('/api/agents/chat/tool-confirmation/pending')
        .query({ id: 'token-1' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        toolName: 'execute_code',
        argsSummary: 'print(1)',
        conversationId: 'conv-1',
      });
      expect(mockToolApprovalLink.updateOne).toHaveBeenCalledWith(
        { _id: 'link-1' },
        expect.objectContaining({ clickedAt: expect.any(Date) }),
      );
    });
  });

  describe('POST /chat/tool-confirmation', () => {
    it('should return 400 when missing approved', async () => {
      const response = await request(app)
        .post('/api/agents/chat/tool-confirmation')
        .send({ id: 'token-1' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Missing required fields',
        required: ['approved'],
      });
    });

    it('should return 400 when missing both token and inline params', async () => {
      const response = await request(app)
        .post('/api/agents/chat/tool-confirmation')
        .send({ approved: true });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Missing required fields',
        required: expect.arrayContaining(['approved']),
      });
    });

    describe('Token flow', () => {
      it('should return 404 when token not found', async () => {
        mockToolApprovalLink.findOne.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({ id: 'invalid-token', approved: true });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'expired' });
        expect(mockToolConfirmationStore.submit).not.toHaveBeenCalled();
      });

      it('should return 404 when token expired', async () => {
        mockToolApprovalLink.findOne.mockResolvedValue({
          token: 'token-1',
          userId: 'test-user-123',
          expiresAt: new Date(Date.now() - 3600000),
          status: 'pending',
        });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({ id: 'token-1', approved: true });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'expired' });
      });

      it('should return 409 when already processed', async () => {
        mockToolApprovalLink.findOne.mockResolvedValue({
          token: 'token-1',
          userId: 'test-user-123',
          expiresAt: new Date(Date.now() + 3600000),
          status: 'approved',
        });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({ id: 'token-1', approved: true });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: 'already processed' });
      });

      it('should return 403 when token belongs to different user', async () => {
        mockToolApprovalLink.findOne.mockResolvedValue({
          token: 'token-1',
          userId: 'other-user-456',
          expiresAt: new Date(Date.now() + 3600000),
          status: 'pending',
          conversationId: 'conv-1',
          runId: 'run-1',
          toolCallId: 'tool-1',
        });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({ id: 'token-1', approved: true });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Unauthorized' });
      });

      it('should return 200 and update link when successful', async () => {
        const link = {
          token: 'token-1',
          userId: 'test-user-123',
          expiresAt: new Date(Date.now() + 3600000),
          status: 'pending',
          conversationId: 'conv-1',
          runId: 'run-1',
          toolCallId: 'tool-1',
        };
        mockToolApprovalLink.findOne.mockResolvedValue(link);
        mockToolApprovalLink.updateOne.mockResolvedValue({});
        mockToolConfirmationStore.submit.mockResolvedValue({ success: true });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({ id: 'token-1', approved: true });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(mockToolConfirmationStore.submit).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          runId: 'run-1',
          toolCallId: 'tool-1',
          approved: true,
          userId: 'test-user-123',
        });
        expect(mockToolApprovalLink.updateOne).toHaveBeenCalledWith(
          { token: 'token-1' },
          expect.objectContaining({
            status: 'approved',
            resolvedAt: expect.any(Date),
          }),
        );
      });
    });

    describe('Inline flow', () => {
      it('should return 404 when conversation not found', async () => {
        mockSearchConversation.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({
            conversationId: 'conv-nonexistent',
            messageId: 'msg-1',
            toolCallId: 'tool-1',
            approved: true,
          });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Conversation not found' });
        expect(mockToolConfirmationStore.submit).not.toHaveBeenCalled();
      });

      it('should return 403 when conversation belongs to different user', async () => {
        mockSearchConversation.mockResolvedValue({
          user: 'other-user-456',
        });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({
            conversationId: 'conv-1',
            messageId: 'msg-1',
            toolCallId: 'tool-1',
            approved: true,
          });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Unauthorized' });
      });

      it('should return 200 when successful', async () => {
        mockSearchConversation.mockResolvedValue({
          user: 'test-user-123',
        });
        mockToolConfirmationStore.submit.mockResolvedValue({ success: true });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({
            conversationId: 'conv-1',
            messageId: 'msg-1',
            toolCallId: 'tool-1',
            approved: true,
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(mockToolConfirmationStore.submit).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          runId: 'msg-1',
          toolCallId: 'tool-1',
          approved: true,
          userId: 'test-user-123',
        });
        expect(mockToolApprovalLink.updateOne).not.toHaveBeenCalled();
      });

      it('should return 404 when ToolConfirmationStore returns expired', async () => {
        mockSearchConversation.mockResolvedValue({
          user: 'test-user-123',
        });
        mockToolConfirmationStore.submit.mockResolvedValue({
          success: false,
          error: 'expired',
        });

        const response = await request(app)
          .post('/api/agents/chat/tool-confirmation')
          .send({
            conversationId: 'conv-1',
            messageId: 'msg-1',
            toolCallId: 'tool-1',
            approved: true,
          });

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ error: 'expired' });
      });
    });
  });
});
