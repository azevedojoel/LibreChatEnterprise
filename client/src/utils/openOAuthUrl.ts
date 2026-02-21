/**
 * Detects mobile/touch devices for OAuth flow (redirect vs popup).
 */
export function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * Opens OAuth URL in a new tab. Used only for async auto-open (e.g. after reinit).
 * No redirect fallback—when it fails, user clicks the OAuthLink (native anchor) as fallback.
 */
export function openOAuthUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Returns the full URL to redirect to chat after OAuth (same-tab flow).
 * Respects base href for subdirectory deployments.
 */
export function getOAuthRedirectUrl(): string {
  const baseEl = document.querySelector('base');
  const baseHref = baseEl?.getAttribute('href') || '/';
  const basePath = baseHref === '/' ? '' : baseHref.replace(/\/$/, '');
  return `${window.location.origin}${basePath}/c/new`;
}
