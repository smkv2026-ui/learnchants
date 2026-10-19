import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { errorMessage } from '@/lib/api';
import { isAdminRole, useAuth } from '@/stores/auth';
import { Button, Card, TextField } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = params.get('next')?.startsWith('/admin') ? params.get('next')! : '/admin';

  useEffect(() => {
    document.title = 'Teacher sign in';
    if (user && isAdminRole(role)) navigate(next, { replace: true });
  }, [user, role, navigate, next]);

  const finish = async () => {
    // Claims are checked server-side everywhere; this only improves the UX.
    const r = await useAuth.getState().refreshClaims();
    if (!isAdminRole(r)) {
      await signOut(auth);
      setError('This account does not have admin access.');
      return;
    }
    navigate(next, { replace: true });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      await finish();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Card className="mandala-bg w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo size={44} withText={false} />
          <h1 className="text-3xl font-semibold">Teacher portal</h1>
          <p className="text-sm text-muted">Sign in with your admin account</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => signInWithEmailAndPassword(auth, email, password));
          }}
        >
          <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" block size="lg" loading={busy}>Sign in</Button>
        </form>
        <Button className="mt-3" variant="secondary" block disabled={busy} onClick={() => void run(() => signInWithPopup(auth, googleProvider))}>
          Sign in with Google
        </Button>
      </Card>
    </main>
  );
}
