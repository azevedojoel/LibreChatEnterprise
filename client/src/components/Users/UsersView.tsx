import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import UserManagement from '~/components/Nav/SettingsTabs/UserManagement';

export default function UsersView() {
  const navigate = useNavigate();
  const { user } = useAuthContext();

  useEffect(() => {
    if (user && user.role !== SystemRoles.ADMIN) {
      navigate('/c/new', { replace: true });
    }
  }, [user, navigate]);

  if (!user || user.role !== SystemRoles.ADMIN) {
    return null;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
      <DashBreadcrumb />
      <div className="flex w-full flex-grow flex-col overflow-hidden">
        <UserManagement />
      </div>
    </div>
  );
}
