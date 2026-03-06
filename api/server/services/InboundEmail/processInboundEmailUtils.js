/**
 * Pure routing helpers for inbound email. Exported for unit testing.
 */
const MAILBOX_HASH_DELIMITER = '__';

/** Extract user token and optional conversationId from MailboxHash or To local part */
function parseRoutingToken(mailboxHash, toAddress) {
  let token = null;
  let conversationId = null;
  if (mailboxHash && typeof mailboxHash === 'string') {
    const trimmed = mailboxHash.trim();
    if (trimmed) {
      const parts = trimmed.split(MAILBOX_HASH_DELIMITER);
      if (parts.length >= 2) {
        token = parts[0];
        conversationId = parts[1];
      } else {
        token = trimmed;
      }
    }
  }
  if (!token && toAddress) {
    const fullLocal = (toAddress.split('@')[0] || '').trim();
    const afterPlus = fullLocal.includes('+') ? fullLocal.split('+').slice(1).join('+') : fullLocal;
    if (afterPlus) {
      const parts = afterPlus.split(MAILBOX_HASH_DELIMITER);
      token = parts[0] || null;
      conversationId = parts[1] || null;
    }
  }
  return { token, conversationId };
}

function buildReplyToAddress(originalRecipient, userToken, conversationId) {
  if (!originalRecipient || !userToken || !conversationId) {
    return null;
  }
  try {
    const atIdx = originalRecipient.indexOf('@');
    if (atIdx === -1) {
      return null;
    }
    const domain = originalRecipient.slice(atIdx);
    const localPart = originalRecipient.slice(0, atIdx);
    const hash = localPart.split('+')[0] || localPart;
    return `${hash}+${userToken}${MAILBOX_HASH_DELIMITER}${conversationId}${domain}`;
  } catch {
    return null;
  }
}

/** Max length for header values to avoid token bloat */
const HEADER_VALUE_MAX_LEN = 200;

/** Headers useful for trust/security analysis (case-insensitive) */
const SECURITY_HEADER_NAMES = new Set([
  'x-spam-status',
  'x-spam-score',
  'x-spam-tests',
  'x-spam-checker-version',
  'received-spf',
  'authentication-results',
  'message-id',
  'date',
  'reply-to',
  'return-path',
  'received',
]);

/**
 * Format security-relevant email headers for LLM context.
 * Used in workspace flow so the agent can assess trustworthiness, detect spoofing, or identify bad actors.
 * @param {Object} payload - Postmark inbound webhook payload
 * @returns {string} Formatted headers block, or empty string if none
 */
function formatEmailHeadersForLLM(payload) {
  const headers = payload?.Headers;
  if (!Array.isArray(headers) || headers.length === 0) {
    const fallback = [];
    if (payload?.MessageID) fallback.push(`Message-ID: ${payload.MessageID}`);
    if (payload?.Date) fallback.push(`Date: ${payload.Date}`);
    if (fallback.length === 0) return '';
    return `[Email metadata - for trust/security analysis:]\n${fallback.join('\n')}\n[End email metadata]`;
  }

  const lines = [];
  let seenReceived = false;

  for (const h of headers) {
    const name = (h?.Name ?? '').trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();
    if (!SECURITY_HEADER_NAMES.has(nameLower)) continue;
    if (nameLower === 'received') {
      if (seenReceived) continue;
      seenReceived = true;
    }
    let value = (h?.Value ?? '').trim();
    if (!value) continue;
    if (value.length > HEADER_VALUE_MAX_LEN) {
      value = value.slice(0, HEADER_VALUE_MAX_LEN) + '...';
    }
    lines.push(`${name}: ${value}`);
  }

  if (lines.length === 0) {
    const fallback = [];
    if (payload?.MessageID) fallback.push(`Message-ID: ${payload.MessageID}`);
    if (payload?.Date) fallback.push(`Date: ${payload.Date}`);
    if (fallback.length === 0) return '';
    return `[Email metadata - for trust/security analysis:]\n${fallback.join('\n')}\n[End email metadata]`;
  }

  return `[Email metadata - for trust/security analysis:]\n${lines.join('\n')}\n[End email metadata]`;
}

/** Build Reply-To for workspace email: {hash}+{slug}__{conversationId}@domain (when hash present) or slug__convId@domain */
function buildWorkspaceReplyTo(originalRecipient, slug, conversationId) {
  if (!originalRecipient || !slug || !conversationId) {
    return null;
  }
  try {
    const atIdx = originalRecipient.indexOf('@');
    if (atIdx === -1) {
      return null;
    }
    const domain = originalRecipient.slice(atIdx);
    const localPart = originalRecipient.slice(0, atIdx);
    const hash = localPart.split('+')[0] || localPart;
    const hasPlus = localPart.includes('+');
    return hasPlus
      ? `${hash}+${slug}${MAILBOX_HASH_DELIMITER}${conversationId}${domain}`
      : `${slug}${MAILBOX_HASH_DELIMITER}${conversationId}${domain}`;
  } catch {
    return null;
  }
}

module.exports = {
  parseRoutingToken,
  buildReplyToAddress,
  buildWorkspaceReplyTo,
  formatEmailHeadersForLLM,
};
