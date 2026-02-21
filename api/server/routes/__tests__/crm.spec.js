/**
 * CRM REST API route tests.
 * Mocks: requireJwtAuth, getProjectById, getAgents, checkPermission, CRM services.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const mockGetProjectById = jest.fn();
const mockGetAgents = jest.fn();
const mockCheckPermission = jest.fn();
const mockListPipelines = jest.fn();
const mockCreatePipeline = jest.fn();
const mockGetPipelineById = jest.fn();
const mockUpdatePipeline = jest.fn();
const mockListContacts = jest.fn();
const mockCreateContact = jest.fn();
const mockGetContactById = jest.fn();
const mockUpdateContact = jest.fn();
const mockListOrganizations = jest.fn();
const mockCreateOrganization = jest.fn();
const mockGetOrganizationById = jest.fn();
const mockUpdateOrganization = jest.fn();
const mockListDeals = jest.fn();
const mockCreateDeal = jest.fn();
const mockGetDealById = jest.fn();
const mockUpdateDeal = jest.fn();
const mockListActivities = jest.fn();

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
}));

jest.mock('~/models/Project', () => ({
  getProjectById: (...args) => mockGetProjectById(...args),
}));

jest.mock('~/models/Agent', () => ({
  getAgents: (...args) => mockGetAgents(...args),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: (...args) => mockCheckPermission(...args),
}));

jest.mock('~/server/services/CRM', () => ({
  listPipelines: (...args) => mockListPipelines(...args),
  createPipeline: (...args) => mockCreatePipeline(...args),
  getPipelineById: (...args) => mockGetPipelineById(...args),
  updatePipeline: (...args) => mockUpdatePipeline(...args),
  listContacts: (...args) => mockListContacts(...args),
  createContact: (...args) => mockCreateContact(...args),
  getContactById: (...args) => mockGetContactById(...args),
  updateContact: (...args) => mockUpdateContact(...args),
  listOrganizations: (...args) => mockListOrganizations(...args),
  createOrganization: (...args) => mockCreateOrganization(...args),
  getOrganizationById: (...args) => mockGetOrganizationById(...args),
  updateOrganization: (...args) => mockUpdateOrganization(...args),
  listDeals: (...args) => mockListDeals(...args),
  createDeal: (...args) => mockCreateDeal(...args),
  getDealById: (...args) => mockGetDealById(...args),
  updateDeal: (...args) => mockUpdateDeal(...args),
  listActivities: (...args) => mockListActivities(...args),
}));

describe('CRM Routes', () => {
  let app;
  const validProjectId = new mongoose.Types.ObjectId().toString();
  const validPipelineId = new mongoose.Types.ObjectId().toString();
  const validContactId = new mongoose.Types.ObjectId().toString();
  const validOrgId = new mongoose.Types.ObjectId().toString();
  const validDealId = new mongoose.Types.ObjectId().toString();
  const agentId = new mongoose.Types.ObjectId().toString();

  const setupAccessGranted = () => {
    mockGetProjectById.mockResolvedValue({ _id: validProjectId });
    mockGetAgents.mockResolvedValue([{ _id: agentId }]);
    mockCheckPermission.mockResolvedValue(true);
  };

  const setupAccessDenied = (projectFound = true) => {
    mockGetProjectById.mockResolvedValue(projectFound ? { _id: validProjectId } : null);
    mockGetAgents.mockResolvedValue(projectFound ? [{ _id: agentId }] : []);
    mockCheckPermission.mockResolvedValue(false);
  };

  beforeAll(() => {
    const crmRouter = require('../crm');
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'user-123', role: 'USER' };
      next();
    });
    app.use('/api/crm', crmRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Access control', () => {
    it('returns 403 when projectId is invalid (not a valid ObjectId)', async () => {
      mockGetProjectById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/crm/projects/invalid-id/pipelines')
        .expect(403);

      expect(response.body.error).toBe('Access denied to this project');
      expect(mockListPipelines).not.toHaveBeenCalled();
    });

    it('returns 403 when project not found', async () => {
      mockGetProjectById.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/crm/projects/${validProjectId}/pipelines`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this project');
    });

    it('returns 403 when user lacks agent access', async () => {
      setupAccessDenied(true);

      const response = await request(app)
        .get(`/api/crm/projects/${validProjectId}/pipelines`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this project');
    });

    it('returns 200 when access granted', async () => {
      setupAccessGranted();
      mockListPipelines.mockResolvedValue([{ _id: validPipelineId, name: 'Sales' }]);

      const response = await request(app)
        .get(`/api/crm/projects/${validProjectId}/pipelines`)
        .expect(200);

      expect(response.body).toEqual([{ _id: validPipelineId, name: 'Sales' }]);
    });
  });

  describe('Pipelines', () => {
    beforeEach(setupAccessGranted);

    it('GET /projects/:projectId/pipelines calls listPipelines and returns JSON', async () => {
      mockListPipelines.mockResolvedValue([{ _id: validPipelineId, name: 'Pipeline' }]);

      const response = await request(app)
        .get(`/api/crm/projects/${validProjectId}/pipelines`)
        .expect(200);

      expect(mockListPipelines).toHaveBeenCalledWith(validProjectId);
      expect(response.body).toHaveLength(1);
    });

    it('POST /projects/:projectId/pipelines returns 400 when name/stages missing', async () => {
      const response = await request(app)
        .post(`/api/crm/projects/${validProjectId}/pipelines`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('name and stages are required');
      expect(mockCreatePipeline).not.toHaveBeenCalled();
    });

    it('POST /projects/:projectId/pipelines returns 201 with created pipeline', async () => {
      const created = { _id: validPipelineId, name: 'Sales', stages: ['lead', 'won'] };
      mockCreatePipeline.mockResolvedValue(created);

      const response = await request(app)
        .post(`/api/crm/projects/${validProjectId}/pipelines`)
        .send({ name: 'Sales', stages: ['lead', 'won'] })
        .expect(201);

      expect(mockCreatePipeline).toHaveBeenCalledWith({
        projectId: validProjectId,
        data: { name: 'Sales', stages: ['lead', 'won'], isDefault: undefined },
      });
      expect(response.body).toEqual(created);
    });

    it('GET /projects/:projectId/pipelines/:id returns 404 when not found', async () => {
      mockGetPipelineById.mockResolvedValue(null);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/pipelines/${validPipelineId}`)
        .expect(404);

      expect(mockGetPipelineById).toHaveBeenCalledWith(validProjectId, validPipelineId);
    });

    it('GET /projects/:projectId/pipelines/:id returns 200 with pipeline', async () => {
      const pipeline = { _id: validPipelineId, name: 'Sales' };
      mockGetPipelineById.mockResolvedValue(pipeline);

      const response = await request(app)
        .get(`/api/crm/projects/${validProjectId}/pipelines/${validPipelineId}`)
        .expect(200);

      expect(response.body).toEqual(pipeline);
    });

    it('PATCH /projects/:projectId/pipelines/:id returns 404 when not found', async () => {
      mockUpdatePipeline.mockResolvedValue(null);

      await request(app)
        .patch(`/api/crm/projects/${validProjectId}/pipelines/${validPipelineId}`)
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('PATCH /projects/:projectId/pipelines/:id returns 200 with updated pipeline', async () => {
      const updated = { _id: validPipelineId, name: 'Updated' };
      mockUpdatePipeline.mockResolvedValue(updated);

      const response = await request(app)
        .patch(`/api/crm/projects/${validProjectId}/pipelines/${validPipelineId}`)
        .send({ name: 'Updated' })
        .expect(200);

      expect(response.body).toEqual(updated);
    });
  });

  describe('Contacts', () => {
    beforeEach(setupAccessGranted);

    it('GET /projects/:projectId/contacts passes query params to listContacts', async () => {
      mockListContacts.mockResolvedValue([]);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/contacts`)
        .query({ status: 'lead', tags: 'vip', noActivitySinceDays: 7, limit: 25, skip: 5 })
        .expect(200);

      expect(mockListContacts).toHaveBeenCalledWith({
        projectId: validProjectId,
        status: 'lead',
        tags: ['vip'],
        noActivitySinceDays: 7,
        limit: 25,
        skip: 5,
      });
    });

    it('POST /projects/:projectId/contacts returns 400 when name missing', async () => {
      await request(app)
        .post(`/api/crm/projects/${validProjectId}/contacts`)
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it('POST /projects/:projectId/contacts returns 201 with actorId=req.user.id', async () => {
      const created = { _id: validContactId, name: 'Jane' };
      mockCreateContact.mockResolvedValue(created);

      const response = await request(app)
        .post(`/api/crm/projects/${validProjectId}/contacts`)
        .send({ name: 'Jane Doe', email: 'jane@test.com' })
        .expect(201);

      expect(mockCreateContact).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: validProjectId,
          data: expect.objectContaining({
            name: 'Jane Doe',
            email: 'jane@test.com',
            ownerType: 'user',
            ownerId: 'user-123',
          }),
          actorId: 'user-123',
          actorType: 'user',
        }),
      );
      expect(response.body).toEqual(created);
    });

    it('GET /projects/:projectId/contacts/:id returns 404 when not found', async () => {
      mockGetContactById.mockResolvedValue(null);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/contacts/${validContactId}`)
        .expect(404);
    });

    it('GET /projects/:projectId/contacts/:id returns 200 with contact', async () => {
      const contact = { _id: validContactId, name: 'Jane' };
      mockGetContactById.mockResolvedValue(contact);

      const response = await request(app)
        .get(`/api/crm/projects/${validProjectId}/contacts/${validContactId}`)
        .expect(200);

      expect(response.body).toEqual(contact);
    });

    it('PATCH /projects/:projectId/contacts/:id returns 404 when not found', async () => {
      mockUpdateContact.mockResolvedValue(null);

      await request(app)
        .patch(`/api/crm/projects/${validProjectId}/contacts/${validContactId}`)
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('PATCH /projects/:projectId/contacts/:id returns 200 with updated contact', async () => {
      const updated = { _id: validContactId, name: 'Updated' };
      mockUpdateContact.mockResolvedValue(updated);

      const response = await request(app)
        .patch(`/api/crm/projects/${validProjectId}/contacts/${validContactId}`)
        .send({ name: 'Updated' })
        .expect(200);

      expect(response.body).toEqual(updated);
    });
  });

  describe('Organizations', () => {
    beforeEach(setupAccessGranted);

    it('GET /projects/:projectId/organizations calls listOrganizations', async () => {
      mockListOrganizations.mockResolvedValue([]);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/organizations`)
        .expect(200);

      expect(mockListOrganizations).toHaveBeenCalledWith(validProjectId);
    });

    it('POST /projects/:projectId/organizations returns 400 when name missing', async () => {
      await request(app)
        .post(`/api/crm/projects/${validProjectId}/organizations`)
        .send({})
        .expect(400);

      expect(mockCreateOrganization).not.toHaveBeenCalled();
    });

    it('POST /projects/:projectId/organizations returns 201 with created org', async () => {
      const created = { _id: validOrgId, name: 'Acme' };
      mockCreateOrganization.mockResolvedValue(created);

      const response = await request(app)
        .post(`/api/crm/projects/${validProjectId}/organizations`)
        .send({ name: 'Acme Corp', domain: 'acme.com' })
        .expect(201);

      expect(response.body).toEqual(created);
    });

    it('GET /projects/:projectId/organizations/:id returns 404 when not found', async () => {
      mockGetOrganizationById.mockResolvedValue(null);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/organizations/${validOrgId}`)
        .expect(404);
    });

    it('PATCH /projects/:projectId/organizations/:id returns 404 when not found', async () => {
      mockUpdateOrganization.mockResolvedValue(null);

      await request(app)
        .patch(`/api/crm/projects/${validProjectId}/organizations/${validOrgId}`)
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('Deals', () => {
    beforeEach(setupAccessGranted);

    it('GET /projects/:projectId/deals passes query params to listDeals', async () => {
      mockListDeals.mockResolvedValue([]);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/deals`)
        .query({ pipelineId: validPipelineId, stage: 'qualified', contactId: validContactId })
        .expect(200);

      expect(mockListDeals).toHaveBeenCalledWith({
        projectId: validProjectId,
        pipelineId: validPipelineId,
        stage: 'qualified',
        contactId: validContactId,
        limit: 50,
        skip: 0,
      });
    });

    it('POST /projects/:projectId/deals returns 400 when stage missing', async () => {
      await request(app)
        .post(`/api/crm/projects/${validProjectId}/deals`)
        .send({ pipelineId: validPipelineId })
        .expect(400);

      expect(mockCreateDeal).not.toHaveBeenCalled();
    });

    it('POST /projects/:projectId/deals returns 201 with actorId=req.user.id', async () => {
      const created = { _id: validDealId, stage: 'qualified' };
      mockCreateDeal.mockResolvedValue(created);

      const response = await request(app)
        .post(`/api/crm/projects/${validProjectId}/deals`)
        .send({
          pipelineId: validPipelineId,
          stage: 'qualified',
          contactId: validContactId,
          value: 1000,
        })
        .expect(201);

      expect(mockCreateDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: validProjectId,
          data: expect.objectContaining({
            pipelineId: validPipelineId,
            stage: 'qualified',
            contactId: validContactId,
            value: 1000,
            ownerType: 'user',
            ownerId: 'user-123',
          }),
          actorId: 'user-123',
          actorType: 'user',
        }),
      );
      expect(response.body).toEqual(created);
    });

    it('PATCH /projects/:projectId/deals/:id uses existing deal for previousStage', async () => {
      const existing = { _id: validDealId, stage: 'qualified' };
      const updated = { _id: validDealId, stage: 'won' };
      mockGetDealById.mockResolvedValueOnce(existing);
      mockUpdateDeal.mockResolvedValue(updated);

      const response = await request(app)
        .patch(`/api/crm/projects/${validProjectId}/deals/${validDealId}`)
        .send({ stage: 'won' })
        .expect(200);

      expect(mockGetDealById).toHaveBeenCalledWith(validProjectId, validDealId);
      expect(mockUpdateDeal).toHaveBeenCalledWith({
        projectId: validProjectId,
        dealId: validDealId,
        updates: { stage: 'won' },
        previousStage: 'qualified',
        actorId: 'user-123',
        actorType: 'user',
      });
      expect(response.body).toEqual(updated);
    });

    it('PATCH /projects/:projectId/deals/:id returns 404 when deal not found', async () => {
      mockGetDealById.mockImplementationOnce(() => Promise.resolve(null));

      const response = await request(app)
        .patch(`/api/crm/projects/${validProjectId}/deals/${validDealId}`)
        .send({ stage: 'won' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Deal not found');
      expect(mockGetDealById).toHaveBeenCalledWith(validProjectId, validDealId);
      expect(mockUpdateDeal).not.toHaveBeenCalled();
    });
  });

  describe('Activities', () => {
    beforeEach(setupAccessGranted);

    it('GET /projects/:projectId/activities passes query params', async () => {
      mockListActivities.mockResolvedValue([]);

      await request(app)
        .get(`/api/crm/projects/${validProjectId}/activities`)
        .query({ contactId: validContactId, dealId: validDealId, limit: 20, skip: 10 })
        .expect(200);

      expect(mockListActivities).toHaveBeenCalledWith({
        projectId: validProjectId,
        contactId: validContactId,
        dealId: validDealId,
        limit: 20,
        skip: 10,
      });
    });
  });
});
