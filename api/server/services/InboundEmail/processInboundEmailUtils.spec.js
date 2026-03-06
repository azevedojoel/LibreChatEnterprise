/**
 * Unit tests for inbound email routing helpers.
 * Run: npm test -- processInboundEmailUtils.spec.js
 */
const {
  parseRoutingToken,
  buildReplyToAddress,
  buildWorkspaceReplyTo,
  formatEmailHeadersForLLM,
} = require('./processInboundEmailUtils');

describe('processInboundEmailUtils', () => {
  describe('parseRoutingToken', () => {
    it('extracts token and conversationId from MailboxHash with __ delimiter', () => {
      const result = parseRoutingToken('userToken__conv-123', null);
      expect(result).toEqual({ token: 'userToken', conversationId: 'conv-123' });
    });

    it('extracts token only when MailboxHash has no __', () => {
      const result = parseRoutingToken('companyx', null);
      expect(result).toEqual({ token: 'companyx', conversationId: null });
    });

    it('extracts from To address local part (no +)', () => {
      const result = parseRoutingToken(null, 'companyx@inbound.example.com');
      expect(result).toEqual({ token: 'companyx', conversationId: null });
    });

    it('extracts from To address with + and __ (personal follow-up)', () => {
      const result = parseRoutingToken(null, 'hash+userToken__conv-456@inbound.example.com');
      expect(result).toEqual({ token: 'userToken', conversationId: 'conv-456' });
    });

    it('extracts from To address with + only (personal new thread)', () => {
      const result = parseRoutingToken(null, 'hash+userToken@inbound.example.com');
      expect(result).toEqual({ token: 'userToken', conversationId: null });
    });

    it('returns null token when both inputs empty', () => {
      const result = parseRoutingToken('', '');
      expect(result.token).toBeNull();
    });

    it('prefers MailboxHash over To address', () => {
      const result = parseRoutingToken('slug__c1', 'other@domain.com');
      expect(result).toEqual({ token: 'slug', conversationId: 'c1' });
    });
  });

  describe('buildReplyToAddress', () => {
    it('builds personal Reply-To with hash+token__convId@domain', () => {
      const result = buildReplyToAddress(
        'hash+token@inbound.example.com',
        'userToken',
        'conv-789',
      );
      expect(result).toBe('hash+userToken__conv-789@inbound.example.com');
    });

    it('returns null when originalRecipient missing', () => {
      expect(buildReplyToAddress(null, 'token', 'conv')).toBeNull();
    });

    it('returns null when userToken missing', () => {
      expect(buildReplyToAddress('a@b.com', null, 'conv')).toBeNull();
    });

    it('returns null when conversationId missing', () => {
      expect(buildReplyToAddress('a@b.com', 'token', null)).toBeNull();
    });

    it('returns null when originalRecipient has no @', () => {
      expect(buildReplyToAddress('invalid', 'token', 'conv')).toBeNull();
    });
  });

  describe('buildWorkspaceReplyTo', () => {
    it('builds workspace Reply-To as slug__convId@domain when no hash in originalRecipient', () => {
      const result = buildWorkspaceReplyTo(
        'companyx@inbound.example.com',
        'companyx',
        'conv-abc',
      );
      expect(result).toBe('companyx__conv-abc@inbound.example.com');
    });

    it('builds workspace Reply-To as hash+slug__convId@domain when hash present (Postmark forwarding)', () => {
      const result = buildWorkspaceReplyTo(
        '108a40bcf11b75b5020e7e5e6858e03d+heald@inbound.postmarkapp.com',
        'heald',
        '9bdd8776-cb57-4cec-84b7-e9c547fa1313',
      );
      expect(result).toBe(
        '108a40bcf11b75b5020e7e5e6858e03d+heald__9bdd8776-cb57-4cec-84b7-e9c547fa1313@inbound.postmarkapp.com',
      );
    });

    it('returns null when originalRecipient missing', () => {
      expect(buildWorkspaceReplyTo(null, 'slug', 'conv')).toBeNull();
    });

    it('returns null when slug missing', () => {
      expect(buildWorkspaceReplyTo('a@b.com', null, 'conv')).toBeNull();
    });

    it('returns null when conversationId missing', () => {
      expect(buildWorkspaceReplyTo('a@b.com', 'slug', null)).toBeNull();
    });

    it('returns null when originalRecipient has no @', () => {
      expect(buildWorkspaceReplyTo('invalid', 'slug', 'conv')).toBeNull();
    });
  });

  describe('formatEmailHeadersForLLM', () => {
    it('returns empty string when payload has no Headers and no MessageID/Date', () => {
      expect(formatEmailHeadersForLLM({})).toBe('');
      expect(formatEmailHeadersForLLM({ Headers: [] })).toBe('');
    });

    it('uses fallback MessageID and Date when Headers is empty', () => {
      const result = formatEmailHeadersForLLM({
        MessageID: '73e6d360-66eb-11e1-8e72-a8904824019b',
        Date: 'Fri, 1 Aug 2014 16:45:32 -04:00',
      });
      expect(result).toContain('[Email metadata - for trust/security analysis:]');
      expect(result).toContain('Message-ID: 73e6d360-66eb-11e1-8e72-a8904824019b');
      expect(result).toContain('Date: Fri, 1 Aug 2014 16:45:32 -04:00');
      expect(result).toContain('[End email metadata]');
    });

    it('includes security-relevant headers from Headers array', () => {
      const payload = {
        Headers: [
          { Name: 'X-Spam-Status', Value: 'No' },
          { Name: 'X-Spam-Score', Value: '-0.1' },
          { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,SPF_PASS' },
          { Name: 'Received-SPF', Value: 'Pass (sender SPF authorized)' },
          { Name: 'Message-ID', Value: '<abc@mail.gmail.com>' },
          { Name: 'Date', Value: 'Thu, 5 Apr 2012 16:59:01 +0200' },
        ],
      };
      const result = formatEmailHeadersForLLM(payload);
      expect(result).toContain('X-Spam-Status: No');
      expect(result).toContain('X-Spam-Score: -0.1');
      expect(result).toContain('X-Spam-Tests: DKIM_SIGNED,DKIM_VALID,SPF_PASS');
      expect(result).toContain('Received-SPF: Pass (sender SPF authorized)');
      expect(result).toContain('Message-ID: <abc@mail.gmail.com>');
      expect(result).toContain('Date: Thu, 5 Apr 2012 16:59:01 +0200');
    });

    it('excludes non-whitelisted headers (e.g. MIME-Version, Content-Type)', () => {
      const payload = {
        Headers: [
          { Name: 'MIME-Version', Value: '1.0' },
          { Name: 'Content-Type', Value: 'text/plain' },
          { Name: 'X-Spam-Status', Value: 'No' },
        ],
      };
      const result = formatEmailHeadersForLLM(payload);
      expect(result).not.toContain('MIME-Version');
      expect(result).not.toContain('Content-Type');
      expect(result).toContain('X-Spam-Status: No');
    });

    it('truncates long header values to 200 chars', () => {
      const longValue = 'x'.repeat(250);
      const payload = {
        Headers: [{ Name: 'Received-SPF', Value: longValue }],
      };
      const result = formatEmailHeadersForLLM(payload);
      expect(result).toContain('Received-SPF: ' + 'x'.repeat(200) + '...');
    });

    it('includes only first Received header', () => {
      const payload = {
        Headers: [
          { Name: 'Received', Value: 'first' },
          { Name: 'Received', Value: 'second' },
          { Name: 'X-Spam-Status', Value: 'No' },
        ],
      };
      const result = formatEmailHeadersForLLM(payload);
      expect(result).toContain('Received: first');
      expect((result.match(/Received:/g) || []).length).toBe(1);
    });

    it('handles case-insensitive header names', () => {
      const payload = {
        Headers: [
          { Name: 'x-spam-status', Value: 'Yes' },
          { Name: 'AUTHENTICATION-RESULTS', Value: 'spf=pass' },
        ],
      };
      const result = formatEmailHeadersForLLM(payload);
      expect(result).toContain('x-spam-status: Yes');
      expect(result).toContain('AUTHENTICATION-RESULTS: spf=pass');
    });
  });
});
