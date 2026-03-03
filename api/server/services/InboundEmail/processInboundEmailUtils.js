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

/** Build Reply-To for workspace email: {slug}__{conversationId}@domain */
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
    return `${slug}${MAILBOX_HASH_DELIMITER}${conversationId}${domain}`;
  } catch {
    return null;
  }
}

module.exports = {
  parseRoutingToken,
  buildReplyToAddress,
  buildWorkspaceReplyTo,
};
