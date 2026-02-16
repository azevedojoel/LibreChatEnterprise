/**
 * Postmark inbound webhook handler.
 * Always returns 200 to Postmark; emails are queued in Redis via BullMQ for async processing.
 */
const { logger } = require('@librechat/data-schemas');
const { verifyPostmarkSignature } = require('~/server/utils/postmarkWebhook');
const { enqueueInboundEmail } = require('~/server/services/InboundEmail/jobQueue');

/**
 * Handle Postmark inbound webhook.
 * POST /api/inbound/email/:pathSecret
 * Never returns 4xx/5xx - always 200 so Postmark does not retry.
 */
const handleInboundEmail = async (req, res) => {
  logger.info('[InboundEmail] Request received', {
    path: req.path,
    method: req.method,
    contentType: req.headers['content-type'],
    hasBody: !!req.body,
    bodyLength: req.body?.length ?? (Buffer.isBuffer(req.body) ? req.body.length : 0),
  });

  const pathSecret = req.params.pathSecret;
  const expectedSecret = process.env.INBOUND_EMAIL_PATH_SECRET;

  if (!expectedSecret || pathSecret !== expectedSecret) {
    logger.warn('[InboundEmail] Path secret mismatch or not configured', {
      path: req.path,
      pathSecretSent: pathSecret ?? '(undefined)',
      pathSecretLength: pathSecret?.length ?? 0,
      expectedSecret: expectedSecret ?? '(undefined)',
      expectedSecretLength: expectedSecret?.length ?? 0,
      match: pathSecret === expectedSecret,
    });
    return res.status(200).send('');
  }

  const rawBody = req.body;
  const signatureHeader = req.headers['x-postmark-signature'];
  const webhookSecret =
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET || process.env.POSTMARK_API_KEY;
  const skipSignatureCheck = process.env.INBOUND_EMAIL_SKIP_SIGNATURE_VERIFICATION === 'true';

  if (webhookSecret && !skipSignatureCheck) {
    if (!signatureHeader) {
      logger.warn(
        '[InboundEmail] No X-Postmark-Signature header - Postmark inbound webhooks may not send this. ' +
          'Set INBOUND_EMAIL_SKIP_SIGNATURE_VERIFICATION=true to bypass, or use IP whitelisting.',
      );
      return res.status(200).send('');
    }
    if (!verifyPostmarkSignature(rawBody, signatureHeader, webhookSecret)) {
      logger.warn('[InboundEmail] Signature verification failed');
      return res.status(200).send('');
    }
  }

  let payload;
  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    payload = JSON.parse(bodyStr);
  } catch (err) {
    logger.error('[InboundEmail] Invalid JSON body:', err);
    return res.status(200).send('');
  }

  const job = await enqueueInboundEmail(payload);
  if (!job) {
    logger.error(
      '[InboundEmail] Failed to enqueue; Redis may be unavailable. Email will not be processed.',
    );
  }

  return res.status(200).send('');
};

module.exports = {
  handleInboundEmail,
};
