/**
 * Workspace route tests.
 * GET /api/workspace/me - Returns current user's workspace when they have workspace_id.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const mockFindUser = jest.fn();
const mockGetWorkspaceById = jest.fn();

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
}));

jest.mock('~/models', () => ({
  findUser: (...args) => mockFindUser(...args),
}));

jest.mock('~/models/Workspace', () => ({
  getWorkspaceById: (...args) => mockGetWorkspaceById(...args),
}));

describe('Workspace Routes', () => {
  let app;
  const validWorkspaceId = new mongoose.Types.ObjectId();
  const validUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(() => {
    const workspaceRouter = require('../workspace');
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: validUserId, role: 'USER' };
      next();
    });
    app.use('/api/workspace', workspaceRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/workspace/me', () => {
    it('returns workspace when user has workspace_id', async () => {
      mockFindUser.mockResolvedValue({
        _id: validUserId,
        workspace_id: validWorkspaceId,
      });
      mockGetWorkspaceById.mockResolvedValue({
        _id: validWorkspaceId,
        name: 'Acme Corp',
        slug: 'acme',
      });

      const response = await request(app)
        .get('/api/workspace/me')
        .expect(200);

      expect(response.body).toEqual({
        workspace: {
          id: validWorkspaceId.toString(),
          name: 'Acme Corp',
          slug: 'acme',
        },
      });
      expect(mockFindUser).toHaveBeenCalledWith(
        { _id: validUserId },
        'workspace_id',
      );
      expect(mockGetWorkspaceById).toHaveBeenCalledWith(
        validWorkspaceId.toString(),
        'name slug',
      );
    });

    it('returns workspace: null when user has no workspace_id', async () => {
      mockFindUser.mockResolvedValue({ _id: validUserId, workspace_id: null });

      const response = await request(app)
        .get('/api/workspace/me')
        .expect(200);

      expect(response.body).toEqual({ workspace: null });
      expect(mockGetWorkspaceById).not.toHaveBeenCalled();
    });

    it('returns workspace: null when workspace not found (stale workspace_id)', async () => {
      mockFindUser.mockResolvedValue({
        _id: validUserId,
        workspace_id: validWorkspaceId,
      });
      mockGetWorkspaceById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/workspace/me')
        .expect(200);

      expect(response.body).toEqual({ workspace: null });
    });

    it('returns 500 when findUser throws', async () => {
      mockFindUser.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/api/workspace/me')
        .expect(500);

      expect(response.body).toEqual({ message: 'Failed to get workspace' });
    });
  });
});
