const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { Constants, EModelEndpoint, ErrorTypes } = require('librechat-data-provider');
const { isUserProvided } = require('@librechat/api');
const BaseClient = require('~/app/clients/BaseClient');
const { getConvo, saveConvo } = require('~/models/Conversation');
const { getMessages, deleteMessages, bulkSaveMessages } = require('~/models/Message');
const { getUserKeyValues } = require('~/models');
const { createImportBatchBuilder } = require('~/server/utils/import/importBatchBuilder');

const SUMMARIZE_MODEL = 'gpt-4o-mini';

/**
 * Get an OpenAI client for summarization. Prefers OPENAI_API_KEY (app or user key),
 * then falls back to ASSISTANTS_API_KEY. Avoids no_user_key when assistants key
 * is user-provided but openAI key is app-level.
 * @param {Object} req - Express request (must have req.user.id)
 * @returns {Promise<OpenAI>} OpenAI client
 */
async function getSummarizeOpenAIClient(req) {
  const { PROXY, OPENAI_ORGANIZATION, OPENAI_API_KEY, OPENAI_REVERSE_PROXY, ASSISTANTS_API_KEY, ASSISTANTS_BASE_URL } =
    process.env;

  const tryOpenAI = async () => {
    const userProvidesKey = isUserProvided(OPENAI_API_KEY);
    if (!userProvidesKey && OPENAI_API_KEY?.trim()) {
      return {
        apiKey: OPENAI_API_KEY,
        baseURL: isUserProvided(OPENAI_REVERSE_PROXY) ? undefined : OPENAI_REVERSE_PROXY,
      };
    }
    if (userProvidesKey && req.user?.id) {
      const userValues = await getUserKeyValues({ userId: req.user.id, name: EModelEndpoint.openAI });
      if (userValues?.apiKey) {
        return {
          apiKey: userValues.apiKey,
          baseURL: userValues.baseURL,
        };
      }
    }
    return null;
  };

  const tryAssistants = async () => {
    const userProvidesKey = isUserProvided(ASSISTANTS_API_KEY);
    if (!userProvidesKey && ASSISTANTS_API_KEY?.trim()) {
      return {
        apiKey: ASSISTANTS_API_KEY,
        baseURL: isUserProvided(ASSISTANTS_BASE_URL) ? undefined : ASSISTANTS_BASE_URL,
      };
    }
    if (userProvidesKey && req.user?.id) {
      const userValues = await getUserKeyValues({ userId: req.user.id, name: EModelEndpoint.assistants });
      if (userValues?.apiKey) {
        return {
          apiKey: userValues.apiKey,
          baseURL: userValues.baseURL,
        };
      }
    }
    return null;
  };

  const creds = (await tryOpenAI()) ?? (await tryAssistants());
  if (!creds?.apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
        message:
          'No API key available for summarization. Set OPENAI_API_KEY or ASSISTANTS_API_KEY, or add your API key in Settings.',
      }),
    );
  }

  const opts = {};
  if (creds.baseURL) {
    opts.baseURL = creds.baseURL;
  }
  if (PROXY) {
    const { ProxyAgent } = require('undici');
    opts.fetchOptions = { dispatcher: new ProxyAgent(PROXY) };
  }
  if (OPENAI_ORGANIZATION) {
    opts.organization = OPENAI_ORGANIZATION;
  }

  return new OpenAI({ apiKey: creds.apiKey, ...opts });
}

/**
 * Get anchor message and all its descendants (messages that are children of anchor or descendants).
 * Ordered so parent comes before children.
 * @param {TMessage[]} messages - All messages in the conversation
 * @param {string} anchorMessageId - The anchor message ID
 * @returns {TMessage[]} Anchor + descendants in topological order
 */
function getMessagesFromAnchor(messages, anchorMessageId) {
  const parentToChildren = new Map();
  for (const msg of messages) {
    const pid = msg.parentMessageId ?? Constants.NO_PARENT;
    if (!parentToChildren.has(pid)) {
      parentToChildren.set(pid, []);
    }
    parentToChildren.get(pid).push(msg);
  }

  const result = [];
  const queue = [anchorMessageId];
  const seen = new Set();

  while (queue.length > 0) {
    const mid = queue.shift();
    if (seen.has(mid)) continue;
    seen.add(mid);

    const msg = messages.find((m) => m.messageId === mid);
    if (msg) {
      result.push(msg);
      const children = parentToChildren.get(mid) ?? [];
      for (const c of children) {
        queue.push(c.messageId);
      }
    }
  }
  return result;
}

/**
 * Get messages in the path from root to anchor's parent (exclusive of anchor).
 * These are the messages to summarize.
 * @param {TMessage[]} messages - All messages in the conversation
 * @param {string} anchorMessageId - The message the user clicked (anchor)
 * @returns {TMessage[]} Messages to summarize, ordered from root to anchor's parent
 */
function getMessagesBeforeAnchor(messages, anchorMessageId) {
  const anchor = messages.find((m) => m.messageId === anchorMessageId);
  if (!anchor) {
    return [];
  }
  const parentId = anchor.parentMessageId ?? Constants.NO_PARENT;
  if (parentId === Constants.NO_PARENT) {
    return [];
  }
  const ordered = BaseClient.getMessagesForConversation({
    messages,
    parentMessageId: parentId,
  });
  return ordered;
}

/**
 * Extract plain text from a message for summarization.
 * @param {TMessage} message - The message to extract text from
 * @returns {string} Extracted text
 */
function extractTextFromMessage(message) {
  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.text != null) return typeof part.text === 'string' ? part.text : part.text?.value ?? '';
        if (part.think != null) {
          const think = part.think;
          return typeof think === 'string' ? think : think?.text ?? '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

/**
 * Format messages for the summarization prompt.
 * @param {TMessage[]} messages - Messages to summarize
 * @returns {string} Formatted conversation text
 */
function formatMessagesForPrompt(messages) {
  return messages
    .map((msg) => {
      const sender = msg.isCreatedByUser ? 'User' : (msg.sender || 'Assistant');
      const text = extractTextFromMessage(msg);
      if (!text) return null;
      return `${sender}: ${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Call LLM to summarize the conversation.
 * @param {string} conversationText - Formatted conversation text
 * @param {Object} req - Express request
 * @returns {Promise<string>} Summary text
 */
async function summarizeWithLLM(conversationText, req) {
  const openai = await getSummarizeOpenAIClient(req);

  const prompt = `Summarize the following conversation. Preserve key facts, decisions, and context. Be concise but complete. Do not add commentary or meta-text.

Conversation:

${conversationText}

Summary:`;

  const completion = await openai.chat.completions.create({
    model: SUMMARIZE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1024,
  });

  const summary = completion.choices[0]?.message?.content?.trim();
  if (!summary) {
    throw new Error('LLM returned empty summary');
  }
  return summary;
}

/**
 * Summarize and truncate a thread.
 * @param {Object} req - Express request
 * @param {Object} params
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.messageId - Anchor message ID (messages before this are summarized)
 * @param {'inPlace' | 'fork'} params.mode - In-place or fork to new conversation
 * @returns {Promise<{ conversation: TConversation, messages?: TMessage[] }>}
 */
async function summarizeThread(req, { conversationId, messageId, mode }) {
  const userId = req.user.id;

  const convo = await getConvo(userId, conversationId);
  if (!convo) {
    throw new Error('Conversation not found');
  }

  const messages = await getMessages({ conversationId, user: userId });
  if (!messages || messages.length === 0) {
    throw new Error('No messages in conversation');
  }

  const messagesToSummarize = getMessagesBeforeAnchor(messages, messageId);
  if (messagesToSummarize.length === 0) {
    throw new Error('No messages to summarize before the selected message');
  }

  const conversationText = formatMessagesForPrompt(messagesToSummarize);
  if (!conversationText.trim()) {
    throw new Error('No extractable text in messages to summarize');
  }

  const summaryText = await summarizeWithLLM(conversationText, req);

  const summaryMessageId = uuidv4();
  const endpoint = convo.endpoint ?? EModelEndpoint.openAI;

  const summaryMessage = {
    messageId: summaryMessageId,
    conversationId,
    parentMessageId: Constants.NO_PARENT,
    sender: 'System',
    text: `[Conversation summary]\n\n${summaryText}`,
    isCreatedByUser: false,
    user: userId,
    endpoint,
    model: convo.model,
  };

  if (mode === 'inPlace') {
    const messagesFromAnchor = getMessagesFromAnchor(messages, messageId);

    await deleteMessages({ conversationId, user: userId });

    const idMapping = new Map();
    const messagesToSave = [];

    const summaryMsg = {
      messageId: summaryMessageId,
      conversationId,
      parentMessageId: Constants.NO_PARENT,
      sender: 'System',
      text: summaryMessage.text,
      isCreatedByUser: false,
      user: userId,
      endpoint,
      model: convo.model,
    };
    messagesToSave.push(summaryMsg);

    for (const msg of messagesFromAnchor) {
      const newId = uuidv4();
      idMapping.set(msg.messageId, newId);
      const parentId =
        msg.parentMessageId && msg.parentMessageId !== Constants.NO_PARENT
          ? idMapping.get(msg.parentMessageId) ?? summaryMessageId
          : summaryMessageId;

      messagesToSave.push({
        messageId: newId,
        conversationId,
        parentMessageId: parentId,
        sender: msg.sender,
        text: msg.text,
        content: msg.content,
        isCreatedByUser: msg.isCreatedByUser,
        model: msg.model,
        user: userId,
        endpoint: msg.endpoint ?? endpoint,
        metadata: msg.metadata,
      });
    }

    await bulkSaveMessages(messagesToSave, true);
    await saveConvo(req, { conversationId, updatedAt: new Date() }, { context: 'SummarizeThread' });

    return { conversation: { ...convo, conversationId }, messages: messagesToSave };
  }

  if (mode === 'fork') {
    const messagesFromAnchor = getMessagesFromAnchor(messages, messageId);

    const builder = createImportBatchBuilder(userId);
    builder.startConversation(endpoint);

    builder.saveMessage({
      ...summaryMessage,
      messageId: summaryMessageId,
      conversationId: builder.conversationId,
      parentMessageId: Constants.NO_PARENT,
      user: userId,
    });

    const idMapping = new Map();

    for (const msg of messagesFromAnchor) {
      const newId = uuidv4();
      idMapping.set(msg.messageId, newId);

      const parentId =
        msg.parentMessageId && msg.parentMessageId !== Constants.NO_PARENT
          ? idMapping.get(msg.parentMessageId) ?? summaryMessageId
          : summaryMessageId;

      builder.saveMessage({
        messageId: newId,
        conversationId: builder.conversationId,
        parentMessageId: parentId,
        sender: msg.sender,
        text: msg.text,
        content: msg.content,
        isCreatedByUser: msg.isCreatedByUser,
        model: msg.model,
        user: userId,
        endpoint: msg.endpoint ?? endpoint,
        metadata: msg.metadata,
      });
    }

    const result = builder.finishConversation(
      `${convo.title || 'Conversation'} (summarized)`,
      new Date(),
      convo,
    );
    await builder.saveBatch();

    return result;
  }

  throw new Error('Invalid mode: must be inPlace or fork');
}

module.exports = {
  getMessagesBeforeAnchor,
  getMessagesFromAnchor,
  extractTextFromMessage,
  formatMessagesForPrompt,
  summarizeWithLLM,
  summarizeThread,
};
