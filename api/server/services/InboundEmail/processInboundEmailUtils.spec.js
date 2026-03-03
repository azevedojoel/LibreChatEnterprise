/**
 * Unit tests for inbound email routing helpers.
 * Run: npm test -- processInboundEmailUtils.spec.js
 */
const {
  parseRoutingToken,
  buildReplyToAddress,
  buildWorkspaceReplyTo,
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
});
