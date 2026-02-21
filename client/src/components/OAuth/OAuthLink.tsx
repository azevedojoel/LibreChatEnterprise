import React from 'react';
import { Button } from '@librechat/client';
import { isMobile } from '~/utils';

interface OAuthLinkProps {
  href: string;
  disabled?: boolean;
  variant?: 'default' | 'submit' | 'outline' | 'destructive' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  children: React.ReactNode;
}

/**
 * Native anchor for OAuth flows. Uses target="_blank" on desktop (new tab),
 * no target on mobile (same-window). Bypasses popup blockers.
 */
export default function OAuthLink({
  href,
  disabled,
  variant = 'default',
  size,
  className,
  children,
}: OAuthLinkProps) {
  const useNewTab = !isMobile();

  return (
    <Button asChild variant={variant} size={size} className={className} disabled={disabled}>
      <a
        href={href}
        target={useNewTab ? '_blank' : undefined}
        rel={useNewTab ? undefined : 'noopener noreferrer'}
        aria-disabled={disabled}
        onClick={disabled ? (e) => e.preventDefault() : undefined}
      >
        {children}
      </a>
    </Button>
  );
}
