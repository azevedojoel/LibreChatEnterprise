import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createScheduledPromptModel } from '../../models/scheduledPrompt';

let mongoServer: MongoMemoryServer;
let ScheduledPrompt: mongoose.Model<any>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  ScheduledPrompt = createScheduledPromptModel(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('ScheduledPrompt schema - selectedTools', () => {
  const userId = new mongoose.Types.ObjectId();
  const promptGroupId = new mongoose.Types.ObjectId();

  it('should store selectedTools as null', async () => {
    const doc = await ScheduledPrompt.create({
      userId,
      agentId: 'agent-1',
      name: 'Test',
      promptGroupId,
      scheduleType: 'recurring',
      cronExpression: '0 0 * * *',
      selectedTools: null,
    });

    expect(doc.selectedTools).toBeNull();
    const found = await ScheduledPrompt.findById(doc._id).lean();
    expect(found?.selectedTools).toBeNull();
  });

  it('should store selectedTools as empty array', async () => {
    const doc = await ScheduledPrompt.create({
      userId,
      agentId: 'agent-1',
      name: 'Test',
      promptGroupId,
      scheduleType: 'recurring',
      cronExpression: '0 0 * * *',
      selectedTools: [],
    });

    expect(doc.selectedTools).toEqual([]);
    const found = await ScheduledPrompt.findById(doc._id).lean();
    expect(found?.selectedTools).toEqual([]);
  });

  it('should store selectedTools as array of strings', async () => {
    const doc = await ScheduledPrompt.create({
      userId,
      agentId: 'agent-1',
      name: 'Test',
      promptGroupId,
      scheduleType: 'recurring',
      cronExpression: '0 0 * * *',
      selectedTools: ['tool1', 'tool2'],
    });

    expect(doc.selectedTools).toEqual(['tool1', 'tool2']);
    const found = await ScheduledPrompt.findById(doc._id).lean();
    expect(found?.selectedTools).toEqual(['tool1', 'tool2']);
  });

  it('should default selectedTools to null when not provided', async () => {
    const doc = await ScheduledPrompt.create({
      userId,
      agentId: 'agent-1',
      name: 'Test',
      promptGroupId,
      scheduleType: 'recurring',
      cronExpression: '0 0 * * *',
    });

    expect(doc.selectedTools).toBeNull();
  });
});
