import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { Spinner } from '@librechat/client';
import { useUserProjectQuery } from '~/data-provider';
import store from '~/store';
import useAuthRedirect from './useAuthRedirect';
import Presentation from '~/components/Chat/Presentation';
import Header from '~/components/Chat/Header';
import Footer from '~/components/Chat/Footer';
import ProjectLanding from '~/components/Chat/InboundLanding/ProjectLanding';

export default function ProjectRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isAuthenticated } = useAuthRedirect();
  const navigate = useNavigate();
  const setSelectedProjectId = useSetRecoilState(store.selectedProjectIdAtom);

  const { data: project, isLoading, isError } = useUserProjectQuery(projectId ?? null, {
    enabled: !!isAuthenticated && !!projectId,
  });

  useEffect(() => {
    if (project) {
      setSelectedProjectId(project._id);
    }
  }, [project, setSelectedProjectId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!projectId || isError || (!isLoading && !project)) {
      navigate('/c/new', { replace: true });
    }
  }, [isAuthenticated, projectId, isError, isLoading, project, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading || !project) {
    return (
      <div className="flex h-screen items-center justify-center" aria-live="polite" role="status">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  return (
    <Presentation>
      <div className="relative flex min-h-0 h-full w-full flex-col overflow-hidden">
        <Header />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <div className="flex w-full flex-col items-center py-8">
            <ProjectLanding project={project} />
          </div>
        </div>
        <Footer />
      </div>
    </Presentation>
  );
}
