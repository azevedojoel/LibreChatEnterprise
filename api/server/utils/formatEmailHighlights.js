const { ContentTypes, Constants } = require('librechat-data-provider');
const { marked, Renderer } = require('marked');
const sanitizeHtml = require('sanitize-html');
const { getToolDisplayName, humanizeToolName } = require('./toolDisplayNames');

const MAX_TOOL_OUTPUT_LEN = 200;
const MAX_ARGS_LEN = 100;

const LC_TRANSFER_PREFIX = Constants.LC_TRANSFER_TO_ || 'lc_transfer_to_';

/** Humanize agent ID when not in agentNames map: "System-Productivity" -> "System Productivity" */
function humanizeAgentId(agentId) {
  if (!agentId || typeof agentId !== 'string') return 'Agent';
  return agentId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Get friendly display name for agent transfer tool (lc_transfer_to_*) */
function getTransferDisplayName(toolName, agentNames = {}) {
  if (!toolName || typeof toolName !== 'string' || !toolName.startsWith(LC_TRANSFER_PREFIX)) {
    return null;
  }
  const agentId = toolName.replace(LC_TRANSFER_PREFIX, '');
  return agentNames[agentId] ?? humanizeAgentId(agentId);
}

/* Matches client/src/style.css .dark theme exactly */
const STYLES = {
  bg: '#171717',
  bgCard: '#212121',
  text: '#ececec',
  textMuted: '#999696',
  pillBg: '#2f2f2f',
  link: '#ab68ff',
  border: '#2f2f2f',
  codeBg: '#2f2f2f',
  blockquoteBorder: '#424242',
};

/** Custom marked renderer with inline styles for email compatibility */
let emailMarkdownRenderer = null;

function getEmailMarkdownRenderer() {
  if (emailMarkdownRenderer) return emailMarkdownRenderer;

  const renderer = new Renderer();

  renderer.paragraph = function (token) {
    const inner = this.parser.parseInline(token.tokens);
    return `<p style="margin: 0 0 12px 0; color: ${STYLES.text}; font-size: 16px; line-height: 1.6;">${inner}</p>\n`;
  };
  renderer.heading = function (token) {
    const inner = this.parser.parseInline(token.tokens);
    const sizes = { 1: '1.5em', 2: '1.25em', 3: '1.15em', 4: '1.05em', 5: '1em', 6: '0.95em' };
    const size = sizes[token.depth] || '1em';
    return `<h${token.depth} style="margin: 16px 0 8px 0; font-size: ${size}; font-weight: 600; color: ${STYLES.text};">${inner}</h${token.depth}>\n`;
  };
  renderer.code = function (token) {
    const langAttr = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : '';
    return `<pre style="margin: 12px 0; padding: 12px 16px; background: ${STYLES.codeBg}; border-radius: 6px; overflow-x: auto; font-size: 14px; line-height: 1.5;"><code${langAttr} style="color: ${STYLES.text}; font-family: ui-monospace, monospace;">${escapeHtml(token.text)}</code></pre>\n`;
  };
  renderer.codespan = function (token) {
    return `<code style="padding: 0.2em 0.4em; background: ${STYLES.codeBg}; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, monospace;">${escapeHtml(token.text)}</code>`;
  };
  renderer.link = function (token) {
    const href = token.href && /^(https?|mailto):/i.test(token.href) ? token.href : '#';
    const inner = this.parser.parseInline(token.tokens);
    const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : '';
    return `<a href="${escapeHtml(href)}"${titleAttr} style="color: ${STYLES.link}; text-decoration: none;">${inner}</a>`;
  };
  renderer.blockquote = function (token) {
    const inner = this.parser.parse(token.tokens);
    return `<blockquote style="margin: 12px 0; padding: 0 0 0 16px; border-left: 4px solid ${STYLES.blockquoteBorder}; color: ${STYLES.textMuted};">${inner}</blockquote>\n`;
  };
  renderer.hr = function () {
    return `<hr style="margin: 16px 0; border: none; border-top: 1px solid ${STYLES.border};">\n`;
  };

  emailMarkdownRenderer = renderer;
  return renderer;
}

/**
 * Convert markdown to email-safe HTML with inline styles.
 * Uses marked with custom renderer and sanitize-html for XSS protection.
 * @param {string} md - Markdown string
 * @returns {string} HTML string
 */
function markdownToEmailHtml(md) {
  if (!md || typeof md !== 'string') return '';

  const renderer = getEmailMarkdownRenderer();
  const raw = marked.parse(md.trim(), { gfm: true, breaks: true, renderer });
  const sanitized = sanitizeHtml(raw, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'code',
      'pre',
      'blockquote',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    allowedAttributes: { a: ['href', 'title'], code: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {},
  });

  return sanitized.trim();
}

/**
 * Format ordered content parts as HTML (dark theme matching website, email-safe inline styles).
 * Supports appName/agentName branding in header/footer.
 * @param {Array} contentParts - Ordered content from response.content
 * @param {string[]} [capturedOAuthUrls=[]] - OAuth URLs to include at top
 * @param {Object} [options={}] - Optional { appName, agentName, userMessage, fileNames }
 * @returns {string} HTML string
 */
function formatEmailHtml(contentParts, capturedOAuthUrls = [], options = {}) {
  if (!Array.isArray(contentParts)) contentParts = [];
  const uniqueUrls = [...new Set(capturedOAuthUrls)];

  const appName = options.appName || process.env.APP_TITLE || 'Daily Thread';
  const parts = [];

  /* Header */
  parts.push(`
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 24px;">
  <tr>
    <td style="font-size: 13px; color: ${STYLES.textMuted};">${escapeHtml(appName)}</td>
  </tr>
</table>`);

  /* Content card - agent content first, then OAuth button(s) centered below */
  const contentBlocks = [];

  for (const part of contentParts) {
    if (!part) continue;

    if ((part.type === 'text' || part.type === ContentTypes.TEXT) && part.text) {
      const text = typeof part.text === 'string' ? part.text : part.text?.value ?? '';
      if (text.trim()) {
        const html = markdownToEmailHtml(text.trim());
        if (html) contentBlocks.push(html);
      }
    } else if (part.type === 'reasoning' || part.type === 'think') {
      const reasoning = part.text ?? part.think ?? part.content ?? '';
      const str = typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning);
      if (str.trim()) {
        contentBlocks.push(`
<div style="margin: 8px 0; padding: 8px 12px; background: ${STYLES.codeBg}; border-left: 4px solid ${STYLES.blockquoteBorder}; border-radius: 6px; font-size: 12px; color: ${STYLES.textMuted};">
  <span style="opacity: 0.8;">—</span> ${escapeHtml(str.trim().slice(0, 500))}${str.length > 500 ? '…' : ''} <span style="opacity: 0.8;">—</span>
</div>`);
      }
    } else if ((part.type === 'tool_call' || part.type === ContentTypes.TOOL_CALL) && part.tool_call) {
      const name = part.tool_call.name ?? part.tool_call.function?.name ?? 'unknown';
      const agentNames = options.agentNames ?? {};
      const transferDisplay = getTransferDisplayName(name, agentNames);
      if (transferDisplay) {
        contentBlocks.push(`
<div style="margin: 12px 0; padding: 12px 16px; background: ${STYLES.pillBg}; border-left: 4px solid ${STYLES.blockquoteBorder}; border-radius: 6px; font-size: 14px; color: ${STYLES.text};">
  <span style="color: ${STYLES.textMuted}; font-weight: 500;">Transferred to</span> <span style="font-weight: 600;">${escapeHtml(transferDisplay)}</span>
</div>`);
      } else {
        const displayName = getToolDisplayName(name);
        contentBlocks.push(
          `<span style="display: inline-block; margin: 2px 4px 2px 0; padding: 4px 10px; background: ${STYLES.pillBg}; color: ${STYLES.textMuted}; border-radius: 6px; font-size: 13px;">${escapeHtml(displayName)}</span>`,
        );
      }
    }
  }

  if (uniqueUrls.length > 0) {
    const btnBg = '#10a37f';
    const appNameForLabel = options.appName || process.env.APP_TITLE || 'Daily Thread';
    const btnHtml = uniqueUrls
      .map((url) => {
        let label = `Sign in via ${appNameForLabel}`;
        try {
          const u = new URL(url);
          if (!u.pathname.includes('/api/mcp/reauth')) {
            label = `Sign in to ${u.hostname}`;
          }
        } catch {
          /* keep default */
        }
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 20px; background: ${btnBg}; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">${escapeHtml(label)}</a>`;
      })
      .join(' ');
    contentBlocks.push(`
<div style="margin: 20px 0; text-align: center;">
  ${btnHtml}
</div>`);
  }

  parts.push(`
<div style="padding: 20px 0;">
${contentBlocks.join('\n')}
</div>`);

  /* Files referenced (when file_search used) */
  const fileNames = options.fileNames;
  if (Array.isArray(fileNames) && fileNames.length > 0) {
    const fileList = fileNames.map((f) => escapeHtml(String(f))).join(', ');
    parts.push(`
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 16px;">
  <tr>
    <td style="font-size: 12px; color: ${STYLES.textMuted};">
      Files referenced: ${fileList}
    </td>
  </tr>
</table>`);
  }

  /* Footer */
  parts.push(`
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid ${STYLES.border};">
  <tr>
    <td style="font-size: 12px; color: ${STYLES.textMuted};">
      Reply to this email to continue the conversation. — ${escapeHtml(appName)}
    </td>
  </tr>
</table>`);

  /* In reply to (user message reference at bottom) */
  const userMessage = options.userMessage;
  if (userMessage && typeof userMessage === 'string' && userMessage.trim()) {
    const preview = userMessage.trim();
    const maxLen = 400;
    const truncated = preview.length > maxLen ? preview.slice(0, maxLen) + '…' : preview;
    const lines = truncated.split('\n').slice(0, 6).join('\n');
    parts.push(`
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 20px; padding-top: 12px; border-top: 1px solid ${STYLES.border};">
  <tr>
    <td>
      <div style="font-size: 11px; color: ${STYLES.textMuted}; padding: 8px 12px; margin-top: 8px; background: ${STYLES.codeBg}; border-left: 3px solid ${STYLES.blockquoteBorder}; border-radius: 4px; line-height: 1.4; white-space: pre-wrap; word-break: break-word;">
        <span style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;">In reply to</span>
        <div style="margin-top: 4px; font-size: 11px;">${escapeHtml(lines)}</div>
      </div>
    </td>
  </tr>
</table>`);
  }

  if (contentBlocks.length === 0 && uniqueUrls.length === 0) return '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>
<body style="margin: 0; padding: 24px 16px; background: ${STYLES.bg}; color: ${STYLES.text}; font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 600px; margin: 0 auto;">
  <tr>
    <td style="background: ${STYLES.bgCard}; padding: 32px; border-radius: 8px; border: 1px solid ${STYLES.border};">
${parts.join('\n')}
    </td>
  </tr>
</table>
</body>
</html>`.trim();
}

/**
 * Format ordered content parts as plain text.
 * @param {Array} contentParts - Ordered content from response.content
 * @param {string[]} [capturedOAuthUrls=[]] - OAuth URLs to include at top
 * @param {Object} [options={}] - Optional { userMessage, fileNames }
 * @returns {string} Plain text string
 */
function formatEmailText(contentParts, capturedOAuthUrls = [], options = {}) {
  if (!Array.isArray(contentParts)) contentParts = [];
  const uniqueUrls = [...new Set(capturedOAuthUrls)];

  const parts = [];

  for (const part of contentParts) {
    if (!part) continue;

    if ((part.type === 'text' || part.type === ContentTypes.TEXT) && part.text) {
      const text = typeof part.text === 'string' ? part.text : part.text?.value ?? '';
      if (text.trim()) parts.push(text.trim());
    } else if (part.type === 'reasoning' || part.type === 'think') {
      const reasoning = part.text ?? part.think ?? part.content ?? '';
      const str = typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning);
      if (str.trim()) parts.push(`--- ${str.trim().slice(0, 300)}${str.length > 300 ? '...' : ''} ---`);
    } else if ((part.type === 'tool_call' || part.type === ContentTypes.TOOL_CALL) && part.tool_call) {
      const name = part.tool_call.name ?? part.tool_call.function?.name ?? 'unknown';
      const agentNames = options.agentNames ?? {};
      const transferDisplay = getTransferDisplayName(name, agentNames);
      if (transferDisplay) {
        parts.push(`--- Transferred to ${transferDisplay} ---`);
      } else {
        parts.push(`[${getToolDisplayName(name)}]`);
      }
    }
  }

  if (uniqueUrls.length > 0) {
    const appNameForLabel = options.appName || process.env.APP_TITLE || 'Daily Thread';
    for (const url of uniqueUrls) {
      let label = `Sign in via ${appNameForLabel}`;
      try {
        const u = new URL(url);
        if (!u.pathname.includes('/api/mcp/reauth')) {
          label = `Sign in to ${u.hostname}`;
        }
      } catch {
        /* keep default */
      }
      parts.push(`${label}: ${url}`);
    }
    parts.push('');
  }

  /* Files referenced (when file_search used) */
  const fileNames = options.fileNames;
  if (Array.isArray(fileNames) && fileNames.length > 0) {
    const fileList = fileNames.join(', ');
    parts.push(`Files referenced: ${fileList}`);
  }

  const userMessage = options.userMessage;
  if (userMessage && typeof userMessage === 'string' && userMessage.trim()) {
    const preview = userMessage.trim();
    const maxLen = 400;
    const truncated = preview.length > maxLen ? preview.slice(0, maxLen) + '...' : preview;
    const lines = truncated.split('\n').slice(0, 6).join('\n');
    parts.push(`\n---\nIn reply to:\n${lines}`);
  }

  return parts.join('\n\n');
}

/**
 * Format ordered content for email. Returns both HTML and plain text.
 * @param {Array} contentParts - Ordered content from response.content
 * @param {string[]} [capturedOAuthUrls=[]] - OAuth URLs to include at top
 * @param {Object} [options={}] - Optional { appName, agentName, userMessage, fileNames }
 * @returns {{ html: string, text: string }}
 */
function formatEmailContent(contentParts, capturedOAuthUrls = [], options = {}) {
  return {
    html: formatEmailHtml(contentParts, capturedOAuthUrls, options),
    text: formatEmailText(contentParts, capturedOAuthUrls, options),
  };
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @deprecated Use formatEmailContent with ordered contentParts instead.
 * Format aggregated agent response for email reply (legacy).
 */
function formatEmailHighlights({ text, reasoning, toolCalls }) {
  const sections = [];

  if (reasoning && reasoning.trim()) {
    sections.push(`---\n${reasoning.trim()}\n---`);
  }

  if (text && text.trim()) {
    sections.push(text.trim());
  }

  if (toolCalls && toolCalls.size > 0) {
    const toolLines = [];
    for (const [, tc] of toolCalls) {
      const name = tc?.function?.name ?? 'unknown';
      const argsStr =
        typeof tc?.function?.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc?.function?.arguments ?? {});
      const output = tc?.output ?? tc?.content ?? '';
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      const truncated =
        outputStr.length > MAX_TOOL_OUTPUT_LEN
          ? outputStr.slice(0, MAX_TOOL_OUTPUT_LEN) + '...'
          : outputStr;

      const displayName = getToolDisplayName(name);
      toolLines.push(`[${displayName}]\n  Args: ${argsStr.slice(0, MAX_ARGS_LEN)}${argsStr.length > MAX_ARGS_LEN ? '...' : ''}`);
      if (truncated) {
        toolLines.push(`  Output: ${truncated}`);
      }
    }
    sections.push('\nTools used:\n' + toolLines.join('\n'));
  }

  return sections.join('\n\n');
}

const MAX_ARG_VALUE_LENGTH = 60;

/**
 * Parse argsSummary JSON into key-value pairs for display. Falls back to raw when truncated or invalid.
 * @param {string} argsSummary - JSON string or raw text
 * @returns {Array<{ key: string, value: string }>}
 */
function parseArgsToBubbles(argsSummary) {
  if (!argsSummary?.trim()) return [];
  try {
    const parsed = JSON.parse(argsSummary);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const pairs = [];
    for (const [key, val] of Object.entries(parsed)) {
      if (key.startsWith('_') || key === '') continue;
      let value = '';
      if (val === null || val === undefined) value = '—';
      else if (typeof val === 'object') value = JSON.stringify(val);
      else value = String(val);
      if (value.length > MAX_ARG_VALUE_LENGTH) value = value.slice(0, MAX_ARG_VALUE_LENGTH) + '…';
      const humanKey = humanizeToolName(key);
      pairs.push({ key: humanKey, value });
    }
    return pairs;
  } catch {
    const display = argsSummary.slice(0, MAX_ARG_VALUE_LENGTH) + (argsSummary.length > MAX_ARG_VALUE_LENGTH ? '…' : '');
    return [{ key: 'Arguments', value: display }];
  }
}

/**
 * Build a friendly subject line for tool approval email.
 * @param {Object} params
 * @param {string} params.toolName
 * @param {string} [params.argsSummary]
 * @param {Object} [options]
 * @param {string} [options.appName]
 * @returns {string}
 */
function buildToolApprovalSubject({ toolName, argsSummary }, options = {}) {
  const appName = options.appName || process.env.APP_TITLE || 'Daily Thread';
  const toolDisplay = getToolDisplayName(toolName || 'Tool');

  let context = '';
  if (argsSummary?.trim()) {
    try {
      const parsed = JSON.parse(argsSummary);
      if (typeof parsed === 'object' && parsed !== null) {
        const priorityKeys = ['name', 'contact', 'to', 'record', 'subject', 'title', 'email'];
        for (const k of priorityKeys) {
          const v = parsed[k];
          if (v != null && typeof v === 'string' && v.trim()) {
            context = v.trim().slice(0, 40);
            if (v.length > 40) context += '…';
            break;
          }
        }
      }
    } catch {
      /* fall through to tool display only */
    }
  }

  const middle = context ? `${toolDisplay} for ${context}` : toolDisplay;
  return `Approval needed: ${middle} — ${appName}`;
}

/**
 * Format tool approval email (HTML and plain text). Dark theme matching reply emails.
 * @param {Object} params
 * @param {string} params.toolName
 * @param {string} [params.argsSummary]
 * @param {string} params.approvalUrl
 * @param {Object} [options]
 * @param {string} [options.appName]
 * @returns {{ html: string, text: string }}
 */
function formatToolApprovalEmail({ toolName, argsSummary, approvalUrl }, options = {}) {
  const appName = options.appName || process.env.APP_TITLE || 'Daily Thread';
  const safeUrl = escapeHtml(approvalUrl || '#');
  const displayName = getToolDisplayName(toolName || 'Tool');
  const bubbles = parseArgsToBubbles(argsSummary || '');

  const btnPrimary = '#10a37f';

  const argBubblesHtml =
    bubbles.length === 0
      ? ''
      : bubbles
          .map(
            ({ key, value }) =>
              `<span style="display: inline-block; margin: 2px 4px 2px 0; padding: 4px 10px; background: ${STYLES.pillBg}; color: ${STYLES.textMuted}; border-radius: 6px; font-size: 13px;"><span style="font-weight: 500; color: ${STYLES.text};">${escapeHtml(key)}:</span> ${escapeHtml(value)}</span>`,
          )
          .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>
<body style="margin: 0; padding: 24px 16px; background: ${STYLES.bg}; color: ${STYLES.text}; font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 600px; margin: 0 auto;">
  <tr>
    <td style="background: ${STYLES.bgCard}; padding: 32px; border-radius: 8px; border: 1px solid ${STYLES.border};">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 24px;">
        <tr>
          <td style="font-size: 13px; color: ${STYLES.textMuted};">${escapeHtml(appName)}</td>
        </tr>
      </table>
      <h1 style="margin: 0 0 12px 0; font-size: 1.25em; font-weight: 600; color: ${STYLES.text};">Tool approval required</h1>
      <p style="margin: 0 0 16px 0; color: ${STYLES.text}; font-size: 16px; line-height: 1.6;">Your agent is requesting to run a potentially destructive tool. Approve or deny to continue.</p>
      <div style="margin: 16px 0; padding: 12px 16px; background: ${STYLES.pillBg}; border-radius: 8px; border: 1px solid ${STYLES.border};">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: ${STYLES.text};">Tool: ${escapeHtml(displayName)}</p>
        ${argBubblesHtml ? `<div style="margin-top: 8px;">${argBubblesHtml}</div>` : ''}
      </div>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 20px; background: ${btnPrimary}; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; margin-right: 12px;">Approve</a>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 20px; background: transparent; color: ${STYLES.textMuted}; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; border: 1px solid ${STYLES.border};">Deny</a>
      </div>
      <div style="margin: 20px 0; padding: 8px 12px; background: ${STYLES.codeBg}; border-radius: 6px; font-size: 13px; color: ${STYLES.textMuted}; display: inline-block;">⏱ Expires in 1 hour</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid ${STYLES.border};">
        <tr>
          <td style="font-size: 12px; color: ${STYLES.textMuted};">— ${escapeHtml(appName)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  const argsText =
    bubbles.length === 0
      ? ''
      : bubbles.map(({ key, value }) => `${key}: ${value}`).join('\n');

  const text = `Your agent requested approval for a destructive action.

Tool: ${displayName}
${argsText ? `Arguments:\n${argsText}\n\n` : ''}Click this link to approve or deny (sign in first if needed):
${approvalUrl || '(link not available)'}

This link expires in 1 hour.`;

  return { html, text };
}

/**
 * Format content parts (from message.content array) for email (legacy).
 */
function formatContentPartsForEmail(contentParts) {
  if (!Array.isArray(contentParts)) return '';

  const parts = [];
  for (const part of contentParts) {
    if (!part) continue;
    if (part.type === ContentTypes.TEXT && part.text) {
      parts.push(typeof part.text === 'string' ? part.text : part.text?.value ?? '');
    } else if (part.type === ContentTypes.TOOL_CALL && part.tool_call) {
      const tc = part.tool_call;
      const name = tc.name ?? tc.function?.name ?? 'unknown';
      const output = tc.output ?? '';
      const outStr = typeof output === 'string' ? output : JSON.stringify(output);
      const truncated = outStr.length > MAX_TOOL_OUTPUT_LEN ? outStr.slice(0, MAX_TOOL_OUTPUT_LEN) + '...' : outStr;
      parts.push(`[${getToolDisplayName(name)}]\n${truncated}`);
    }
  }
  return parts.join('\n\n');
}

module.exports = {
  formatEmailHighlights,
  formatContentPartsForEmail,
  formatEmailContent,
  formatEmailHtml,
  formatEmailText,
  markdownToEmailHtml,
  formatToolApprovalEmail,
  buildToolApprovalSubject,
};
