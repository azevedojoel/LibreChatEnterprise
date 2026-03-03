import { useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocalize, useShowMarketplace } from '~/hooks';

interface AgentMarketplaceNavProps {
  isSmallScreen?: boolean;
  toggleNav?: () => void;
}

export default function AgentMarketplaceNav({
  isSmallScreen,
  toggleNav,
}: AgentMarketplaceNavProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const showAgentMarketplace = useShowMarketplace();

  const handleAgentMarketplace = useCallback(() => {
    navigate('/agents');
    if (isSmallScreen && toggleNav) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  if (!showAgentMarketplace) {
    return null;
  }

  return (
    <div className="mb-1">
      <div
        role="button"
        tabIndex={0}
        aria-label={localize('com_agents_marketplace')}
        className="group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        onClick={handleAgentMarketplace}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleAgentMarketplace();
          }
        }}
        data-testid="nav-agents-marketplace-button"
      >
        <div className="flex flex-1 items-center truncate pr-6">
          <div className="mr-2 h-5 w-5">
            <LayoutGrid className="h-5 w-5 text-text-primary" />
          </div>
          <span className="truncate">{localize('com_agents_marketplace')}</span>
        </div>
      </div>
    </div>
  );
}
