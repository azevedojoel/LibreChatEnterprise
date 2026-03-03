import workspaceSchema, { IMongoWorkspace } from '~/schema/workspace';

/**
 * Creates or returns the Workspace model using the provided mongoose instance and schema
 */
export function createWorkspaceModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Workspace || mongoose.model<IMongoWorkspace>('Workspace', workspaceSchema)
  );
}
