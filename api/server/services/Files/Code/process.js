/**
 * Prepares files for the execute_code tool.
 * Code execution runs locally; this gathers file metadata for the tool context.
 */
const { Tools, EToolResources } = require('librechat-data-provider');
const { getFiles } = require('~/models');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');

/**
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId]
 * @param {string} [_codeApiKey] - Unused for local execution; kept for signature compatibility
 * @returns {Promise<{ files: Array<{ file_id: string; filename: string; filepath?: string }>; toolContext: string | null }>}
 */
const primeFiles = async (options, _codeApiKey) => {
  const { tool_resources, req, agentId } = options;
  const file_ids = tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
  const resourceFiles = tool_resources?.[EToolResources.execute_code]?.files ?? [];

  const allFiles = (await getFiles({ file_id: { $in: file_ids } }, null, { text: 0 })) ?? [];

  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  } else {
    dbFiles = allFiles;
  }

  dbFiles = dbFiles.concat(resourceFiles);

  const files = dbFiles
    .filter(Boolean)
    .map((file) => ({
      file_id: file.file_id,
      filename: file.filename,
      filepath: file.filepath,
      source: file.source,
    }));

  let toolContext = null;
  if (files.length > 0) {
    const filenames = files.map((f) => f.filename).join(', ');
    const exampleFilename = files[0]?.filename ?? 'file.csv';
    toolContext = `- The user has attached file(s) for analysis: ${filenames}. Use the ${Tools.execute_code} tool. These files are pre-loaded in your workspace—reference them by filename (e.g., pd.read_csv('${exampleFilename}')).`;
  }

  return { files, toolContext };
};

module.exports = { primeFiles };
