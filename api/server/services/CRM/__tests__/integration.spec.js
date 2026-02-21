/**
 * CRM integration tests - uses mongodb-memory-server and real Mongoose models.
 * Full flow: createPipeline → createContact → createOrganization → createDeal →
 * updateDeal (stage change) → listActivities.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const dbModels = require('~/db/models');
const {
  createPipeline,
  createContact,
  createOrganization,
  createDeal,
  updateDeal,
  listActivities,
  listContacts,
} = require('../index');

describe('CRM Integration', () => {
  let mongoServer;
  let projectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    const Project = dbModels.Project;
    const project = await Project.create({ name: 'Test CRM Project' });
    projectId = project._id.toString();
  }, 20000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await dbModels.Pipeline.deleteMany({});
    await dbModels.Contact.deleteMany({});
    await dbModels.Organization.deleteMany({});
    await dbModels.Deal.deleteMany({});
    await dbModels.Activity.deleteMany({});
  });

  it('full flow: createPipeline → createContact → createOrganization → createDeal → updateDeal → listActivities', async () => {
    const userId = 'user-integration-test';

    const pipeline = await createPipeline({
      projectId,
      data: {
        name: 'Sales',
        stages: ['lead', 'qualified', 'won', 'lost'],
        isDefault: true,
      },
    });
    expect(pipeline).toBeDefined();
    expect(pipeline.stages).toEqual(['lead', 'qualified', 'won', 'lost']);

    const contact = await createContact({
      projectId,
      data: {
        name: 'Jane Doe',
        email: 'jane@test.com',
        ownerType: 'user',
        ownerId: userId,
      },
      actorId: userId,
      actorType: 'user',
    });
    expect(contact).toBeDefined();
    expect(contact.name).toBe('Jane Doe');

    const org = await createOrganization({
      projectId,
      data: { name: 'Acme Corp', domain: 'acme.com' },
    });
    expect(org).toBeDefined();

    const deal = await createDeal({
      projectId,
      data: {
        pipelineId: pipeline._id.toString(),
        stage: 'lead',
        contactId: contact._id.toString(),
        organizationId: org._id.toString(),
        value: 5000,
        ownerType: 'user',
        ownerId: userId,
      },
      actorId: userId,
      actorType: 'user',
    });
    expect(deal).toBeDefined();
    expect(deal.stage).toBe('lead');

    const updatedDeal = await updateDeal({
      projectId,
      dealId: deal._id.toString(),
      updates: { stage: 'qualified' },
      previousStage: deal.stage,
      actorId: userId,
      actorType: 'user',
    });
    expect(updatedDeal.stage).toBe('qualified');

    const activities = await listActivities({
      projectId,
      limit: 50,
    });
    expect(activities.length).toBeGreaterThanOrEqual(3);

    const activityTypes = activities.map((a) => a.type);
    expect(activityTypes).toContain('contact_created');
    expect(activityTypes).toContain('deal_created');
    expect(activityTypes).toContain('stage_change');
  });

  it('listContacts with noActivitySinceDays returns contacts with no recent activity', async () => {
    const userId = 'user-no-activity-test';

    const contactWithActivity = await createContact({
      projectId,
      data: {
        name: 'Recently Contacted',
        email: 'recent@test.com',
        ownerType: 'user',
        ownerId: userId,
      },
      actorId: userId,
      actorType: 'user',
    });
    expect(contactWithActivity).toBeDefined();

    const contactWithoutActivity = await createContact({
      projectId,
      data: {
        name: 'Never Contacted',
        email: 'never@test.com',
        ownerType: 'user',
        ownerId: userId,
      },
      actorId: null,
      actorType: 'user',
    });
    expect(contactWithoutActivity).toBeDefined();

    const contactsNoActivity = await listContacts({
      projectId,
      noActivitySinceDays: 7,
    });
    expect(Array.isArray(contactsNoActivity)).toBe(true);
    const neverContacted = contactsNoActivity.find(
      (c) => c.email === 'never@test.com' || c.name === 'Never Contacted',
    );
    expect(neverContacted).toBeDefined();
  });
});
