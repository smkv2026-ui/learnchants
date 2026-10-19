import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { isAdminRole, useAuth } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button, Card, Icon } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, role, refreshClaims } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const here = `/admin/invite/${token}`;

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await api.acceptAdminInvite({ token });
      await refreshClaims();
      toast.success('Welcome to the teacher portal!');
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Card className="mandala-bg w-full max-w-md p-7 text-center">
        <div className="mb-4 flex justify-center"><Logo size={44} withText={false} /></div>
        <h1 className="text-3xl font-semibold">Teacher invitation</h1>
        {isAdminRole(role) ? (
          <>
            <p className="mt-3 text-sm text-muted">You already have admin access.</p>
            <Link to="/admin"><Button className="mt-6">Open portal</Button></Link>
          </>
        ) : !user ? (
          <>
            <p className="mt-3 text-sm text-muted">Sign in (or create an account) with the email address this invite was sent to, then come back to this link.</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link to={`/login?next=${encodeURIComponent(here)}`}><Button block>Sign in</Button></Link>
              <Link to={`/signup?next=${encodeURIComponent(here)}`}><Button block variant="secondary">Create account</Button></Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">Signed in as <strong>{user.email}</strong>. Accept to become a teacher (admin).</p>
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted"><Icon name="shield" size={14} /> Learners never see who their teachers are.</p>
            {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
            <Button className="mt-6" size="lg" loading={busy} onClick={() => void accept()}>Accept invitation</Button>
          </>
        )}
      </Card>
    </main>
  );
}
