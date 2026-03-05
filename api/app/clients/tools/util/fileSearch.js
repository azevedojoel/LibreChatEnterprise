const axios = require('axios');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { generateShortLivedToken } = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { getFiles } = require('~/models');

const fileSearchJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        "A natural language query or filename. For semantic search: use keywords related to the information you're looking for. For filename search: use the exact or partial filename (e.g. 'contacts_2024.json', 'export.csv') to find files by name.",
    },
  },
  required: ['query'],
};

/** Max number of user files to include in file_search (most recent first) */
const FILE_SEARCH_LIMIT = 50;

/**
 * Primes files for the file_search tool. Always searches the user's My Files (embedded documents).
 * Attached files are for analysis/context—file_search searches the user's full file library.
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {string} [options.agentId] - The agent ID for file access control
 * @returns {Promise<{
 *   files: Array<{ file_id: string; filename: string }>,
 *   toolContext: string
 * }>}
 */
const primeFiles = async (options) => {
  const { req, agentId } = options;

  if (!req?.user?.id) {
    return {
      files: [],
      toolContext: `- Note: Semantic search is available through the ${Tools.file_search} tool but no files are currently loaded. Request the user to upload documents to search through.`,
    };
  }

  const userId = req.user.id?.toString?.() ?? req.user.id;

  // Always search the user's My Files (embedded documents)
  const allFiles =
    (await getFiles(
      { user: userId, embedded: true },
      null,
      { text: 0 },
    )) ?? [];

  // Limit to most recent files for performance
  const limitedFiles = allFiles.slice(0, FILE_SEARCH_LIMIT);

  // Filter by access if agent is provided
  let dbFiles;
  if (agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: limitedFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  } else {
    dbFiles = limitedFiles;
  }

  let toolContext =
    dbFiles.length === 0
      ? `- Note: Semantic search is available through the ${Tools.file_search} tool but no files are currently loaded. Request the user to upload documents to My Files to search through.`
      : `- Note: Use the ${Tools.file_search} tool to search across the user's My Files:`;

  const files = [];
  for (const file of dbFiles) {
    if (!file) continue;
    toolContext += `\n\t- ${file.filename}`;
    files.push({
      file_id: file.file_id,
      filename: file.filename,
    });
  }

  return { files, toolContext };
};

/** Query looks like a filename (e.g. "contacts.json" or "report_2024.csv") */
const looksLikeFilename = (q) =>
  typeof q === 'string' &&
  q.trim().length > 0 &&
  /\.(json|csv|txt|md|xlsx?|docx?|pdf)$/i.test(q.trim());

/**
 * Fetch files by filename match (includes execute_code/run_tool_and_save files not in RAG).
 * @param {string} userId
 * @param {string} query - Filename or partial match
 * @param {Object} [options] - { req, agentId } for access filtering
 */
const fetchFilesByFilename = async (userId, query, options = {}) => {
  const { req, agentId } = options;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    user: userId,
    filename: { $regex: `^${escaped}`, $options: 'i' },
  };
  let matches = (await getFiles(filter, null, { text: 0 })) ?? [];
  if (agentId && req?.user) {
    matches = await filterFilesByAgentAccess({
      files: matches,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  }
  return matches.slice(0, 10).map((f) => ({
    file_id: f.file_id,
    filename: f.filename,
    content: `[File: ${f.filename}]`,
    distance: 0,
    page: null,
  }));
};

/**
 *
 * @param {Object} options
 * @param {string} options.userId
 * @param {Array<{ file_id: string; filename: string }>} options.files
 * @param {string} [options.entity_id]
 * @param {boolean} [options.fileCitations=false] - Whether to include citation instructions
 * @param {Object} [options.req] - Request for filename lookup and access control
 * @param {string} [options.agentId] - Agent ID for file access control
 * @returns
 */
const createFileSearchTool = async ({
  userId,
  files,
  entity_id,
  fileCitations = false,
  req,
  agentId,
}) => {
  return tool(
    async ({ query }) => {
      // Filename lookup: run_tool_and_save JSON/CSV files are not embedded; search by name
      let filenameResults = [];
      if (looksLikeFilename(query)) {
        filenameResults = await fetchFilesByFilename(userId, query, { req, agentId });
      }

      if (files.length === 0 && filenameResults.length === 0) {
        return [
          'No files to search. The user has no embedded files in My Files. Instruct them to upload documents to My Files to enable search.',
          undefined,
        ];
      }

      if (files.length === 0) {
        const formattedString = filenameResults
          .map(
            (r, i) =>
              `File: ${r.filename}\nfile_id: ${r.file_id}${
                fileCitations ? `\nAnchor: \\ue202turn0file${i} (${r.filename})` : ''
              }\nRelevance: 1.0000\nContent: ${r.content}\n`,
          )
          .join('---\n');
        const sources = filenameResults.map((r) => ({
          type: 'file',
          fileId: r.file_id,
          content: r.content,
          fileName: r.filename,
          relevance: 1.0,
          pages: [],
          pageRelevance: {},
        }));
        return [formattedString, { [Tools.file_search]: { sources, fileCitations } }];
      }

      const jwtToken = generateShortLivedToken(userId);
      if (!jwtToken) {
        return ['There was an error authenticating the file search request.', undefined];
      }

      /**
       * @param {import('librechat-data-provider').TFile} file
       * @returns {{ file_id: string, query: string, k: number, entity_id?: string }}
       */
      const createQueryBody = (file) => {
        const body = {
          file_id: file.file_id,
          query,
          k: 5,
        };
        if (!entity_id) {
          return body;
        }
        body.entity_id = entity_id;
        logger.debug(`[${Tools.file_search}] RAG API /query body`, body);
        return body;
      };

      const queryPromises = files.map((file) =>
        axios
          .post(`${process.env.RAG_API_URL}/query`, createQueryBody(file), {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          })
          .catch((error) => {
            logger.error('Error encountered in `file_search` while querying file:', error);
            return null;
          }),
      );

      const results = await Promise.all(queryPromises);
      const validResults = results.filter((result) => result !== null);

      let formattedResults = [];
      if (validResults.length > 0) {
        formattedResults = validResults
          .flatMap((result, fileIndex) =>
            result.data.map(([docInfo, distance]) => ({
              filename: files[fileIndex]?.filename ?? docInfo.metadata.source?.split('/').pop() ?? 'Unknown',
              content: docInfo.page_content,
              distance,
              file_id: files[fileIndex]?.file_id,
              page: docInfo.metadata.page || null,
            })),
          )
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);
      }

      // Prepend filename matches (e.g. run_tool_and_save JSON/CSV) so they rank first
      const seenIds = new Set(formattedResults.map((r) => r.file_id));
      for (const r of filenameResults) {
        if (!seenIds.has(r.file_id)) {
          seenIds.add(r.file_id);
          formattedResults.unshift({
            filename: r.filename,
            content: r.content,
            distance: 0,
            file_id: r.file_id,
            page: null,
          });
        }
      }
      formattedResults = formattedResults.slice(0, 10);

      if (formattedResults.length === 0) {
        return [
          'No content found in the files. The files may not have been processed correctly or you may need to refine your query.',
          undefined,
        ];
      }

      // Deduplicate by file_id so we count unique files, not chunks (RAG returns multiple chunks per file)
      // Filter out content snippets misidentified as filenames (e.g. "Listed but not BBB accredited")
      const hasFileExtension = (name) => /\.(pdf|docx?|xlsx?|txt|md|csv|pptx?|jpg|jpeg|png|gif|webp)$/i.test(name ?? '');

      const sourcesByFile = new Map();
      for (const result of formattedResults) {
        if (!hasFileExtension(result.filename)) continue;

        const fileId = result.file_id;
        const relevance = 1.0 - result.distance;
        const page = result.page ?? null;
        const pageRelevance = page ? { [page]: relevance } : {};

        const existing = sourcesByFile.get(fileId);
        if (!existing) {
          sourcesByFile.set(fileId, {
            type: 'file',
            fileId,
            content: result.content,
            fileName: result.filename,
            relevance,
            pages: page ? [page] : [],
            pageRelevance,
          });
        } else {
          if (relevance > existing.relevance) {
            existing.content = result.content;
          }
          existing.relevance = Math.max(existing.relevance, relevance);
          if (page && !existing.pages.includes(page)) {
            existing.pages.push(page);
            existing.pages.sort((a, b) => a - b);
          }
          Object.assign(existing.pageRelevance, pageRelevance);
        }
      }
      const sources = Array.from(sourcesByFile.values());

      const formattedString = formattedResults
        .map(
          (result, index) =>
            `File: ${result.filename}\nfile_id: ${result.file_id ?? 'unknown'}${
              fileCitations ? `\nAnchor: \\ue202turn0file${index} (${result.filename})` : ''
            }\nRelevance: ${(1.0 - result.distance).toFixed(4)}\nContent: ${result.content}\n`,
        )
        .join('\n---\n');

      return [formattedString, { [Tools.file_search]: { sources, fileCitations } }];
    },
    {
      name: Tools.file_search,
      responseFormat: 'content_and_artifact',
      description: `Performs semantic search across the user's My Files using natural language queries. Also supports filename search: when the query looks like a filename (e.g. "contacts_2024.json" or "export.csv"), returns matching files by name—including JSON/CSV exports from run_tool_and_save. Use this when the user asks to search their files, find information in their documents, or locate a file by name.${
        fileCitations
          ? `

**CITE FILE SEARCH RESULTS:**
Use the EXACT anchor markers shown below (copy them verbatim) immediately after statements derived from file content. Reference the filename in your text:
- File citation: "The document.pdf states that... \\ue202turn0file0"  
- Page reference: "According to report.docx... \\ue202turn0file1"
- Multi-file: "Multiple sources confirm... \\ue200\\ue202turn0file0\\ue202turn0file1\\ue201"

**CRITICAL:** Output these escape sequences EXACTLY as shown (e.g., \\ue202turn0file0). Do NOT substitute with other characters like † or similar symbols.
**ALWAYS mention the filename in your text before the citation marker. NEVER use markdown links or footnotes.**`
          : ''
      }`,
      schema: fileSearchJsonSchema,
    },
  );
};

module.exports = { createFileSearchTool, primeFiles, fileSearchJsonSchema };
