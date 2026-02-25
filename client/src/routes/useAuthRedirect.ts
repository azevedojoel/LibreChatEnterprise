import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, roles, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated) {
        const returnPath = location.pathname + location.search;
        const redirect =
          returnPath && returnPath !== '/login' ? `?redirect=${encodeURIComponent(returnPath)}` : '';
        navigate(`/login${redirect}`, { replace: true });
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate, location.pathname, location.search]);

  return {
    user,
    roles,
    isAuthenticated,
  };
}
