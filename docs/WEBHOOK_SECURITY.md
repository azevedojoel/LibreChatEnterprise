# Webhook Security

When implementing inbound webhooks (e.g., inbound email, third-party integrations), you must verify that requests are authentic and have not been tampered with. Relying on a secret path or sender email alone is insufficient; use cryptographic signature verification.

## Required: Signature Verification

1. **Require HMAC-SHA256 signature verification** before processing any webhook payload.
2. Use a **webhook secret** from environment variables (e.g., `WEBHOOK_SECRET`). Never hardcode it.
3. **Reject** requests with invalid or missing signatures with `401 Unauthorized` or `403 Forbidden`.

### Generic HMAC-SHA256 Pattern

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// In route handler:
app.post('/webhooks/inbound-email', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  if (!verifyWebhookSignature(req.body.toString(), signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // Process payload...
});
```

**Important:** Use `express.raw()` or equivalent so `req.body` is the raw buffer. Parsed JSON can change (e.g., key ordering) and break signature verification.

### Provider-Specific Patterns

Different providers use different header names and formats:

| Provider | Header | Format |
|---------|--------|--------|
| Stripe | `Stripe-Signature` | `t=timestamp,v1=signature`; verify with `crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex')` |
| Postmark | `X-Postmark-Signature` | HMAC-SHA256 of raw body with server token |
| GitHub | `X-Hub-Signature-256` | `sha256=` + hex(HMAC-SHA256(body, secret)) |
| SendGrid | `X-Twilio-Email-Event-Webhook-Signature` | ECDSA; use their SDK |

Consult each provider's webhook docs for the exact verification logic.

## Additional Trust Checks

Before mapping a webhook payload to a user and executing agent actions:

1. **Validate sender identity** – e.g., verify the sender email is associated with a known user before routing.
2. **Validate payload structure** – reject malformed or unexpectedly large payloads.
3. **Replay protection** – if the provider sends a timestamp in the signature, reject requests older than a short window (e.g., 5 minutes).
4. **Rate limiting** – throttle webhook endpoints to reduce abuse risk.

## Implementation Checklist

- [ ] Signature verification middleware runs **before** any business logic
- [ ] `WEBHOOK_SECRET` (or provider-specific secret) comes from env, not code
- [ ] Invalid/missing signature returns 401 or 403 (do not leak info about why it failed)
- [ ] Raw body is used for signing; do not parse and re-serialize
- [ ] Sender/identity validated before mapping to user and executing actions
- [ ] Optional: replay protection and rate limiting
