import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { useUserProjectsQuery, useGetWorkspaceMeQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import useAuthRedirect from './useAuthRedirect';

export default function InboundProjectRoute() {
  const { isAuthenticated, user } = useAuthRedirect();
  const navigate = useNavigate();

  const { data: workspaceMeData } = useGetWorkspaceMeQuery({ enabled: !!user });
  const { data: projectsData, isLoading: projectsLoading } = useUserProjectsQuery(
    { limit: 50 },
    { enabled: !!user },
  );

  const inboundProject = useMemo(() => {
    const projects = projectsData?.projects ?? [];
    return projects.find((p) => p.isInbound) ?? null;
  }, [projectsData]);

  const hasWorkspace = !!workspaceMeData?.workspace;

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!hasWorkspace || !inboundProject) {
      navigate('/c/new', { replace: true });
      return;
    }
    navigate(`/c/project/${inboundProject._id}`, { replace: true });
  }, [isAuthenticated, hasWorkspace, inboundProject, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen items-center justify-center" aria-live="polite" role="status">
      <Spinner className="text-text-primary" />
    </div>
  );
}
