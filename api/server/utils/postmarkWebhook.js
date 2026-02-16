const crypto = require('crypto');

/**
 * Verify Postmark webhook signature.
 * Per WEBHOOK_SECURITY.md: X-Postmark-Signature = HMAC-SHA256 of raw body with server token.
 * @param {Buffer|string} rawBody - Raw request body (before JSON parse)
 * @param {string} [signatureHeader] - Value of X-Postmark-Signature header
 * @param {string} [secret] - Webhook secret (POSTMARK_API_KEY or INBOUND_EMAIL_WEBHOOK_SECRET)
 * @returns {boolean} true if signature is valid
 */
function verifyPostmarkSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) {
    return false;
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expectedHex = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', secret).update(body).digest('base64');

  try {
    // Postmark may send hex or base64; try both
    if (signatureHeader.length === 64 && /^[a-fA-F0-9]+$/.test(signatureHeader)) {
      return crypto.timingSafeEqual(
        Buffer.from(signatureHeader, 'hex'),
        Buffer.from(expectedHex, 'hex'),
      );
    }
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'base64'),
      Buffer.from(expectedBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

module.exports = {
  verifyPostmarkSignature,
};
