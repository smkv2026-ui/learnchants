import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { errorMessage } from '@/lib/api';
import { completeSignIn } from '@/lib/session';
import { toast } from '@/stores/ui';
import { Button, Card, TextField } from '@/components/ui';
import { Page } from '@/components/layout/Page';


function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Page title={title} className="flex min-h-[80vh] items-center justify-center">
      <Card className="mandala-bg w-full max-w-md p-6 sm:p-8">
        <h1 className="text-center text-4xl font-semibold">{title}</h1>
        <p className="mb-6 mt-2 text-center text-sm text-muted">{subtitle}</p>
        {children}
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </Card>
    </Page>
  );
}

function GoogleButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      block
      size="lg"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithPopup(auth, googleProvider);
          await completeSignIn();
          onDone();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Continue with Google
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
      <span className="h-px flex-1 bg-ink/10" /> or <span className="h-px flex-1 bg-ink/10" />
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
});

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const done = () => navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Continue your chanting practice"
      footer={
        <>
          New here? <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-primary">Create an account</Link>
        </>
      }
    >
      <GoogleButton onDone={done} />
      <Divider />
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ email, password }) => {
          try {
            await signInWithEmailAndPassword(auth, email, password);
            await completeSignIn();
            done();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        })}
      >
        <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="current-password" {...register('password')} error={formState.errors.password?.message} />
        <div className="text-right text-sm">
          <Link to="/reset" className="text-muted hover:text-ink">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(60),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

export function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const { register, handleSubmit, formState } = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) });
  const done = () => navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });

  return (
    <AuthShell
      title="Begin your journey"
      subtitle="Learn chants verse by verse with gentle guidance"
      footer={
        <>
          Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-primary">Sign in</Link>
        </>
      }
    >
      <GoogleButton onDone={done} />
      <Divider />
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ name, email, password }) => {
          try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(cred.user, { displayName: name });
            await completeSignIn(name);
            toast.success(`Welcome, ${name}!`);
            done();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        })}
      >
        <TextField label="Your name" autoComplete="name" {...register('name')} error={formState.errors.name?.message} />
        <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="new-password" {...register('password')} error={formState.errors.password?.message} />
        <p className="text-xs text-muted">
          By continuing you agree to our <Link to="/privacy" className="underline">privacy policy</Link>. Your recordings are visible only to you and your teachers.
        </p>
        <Button type="submit" block size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ResetPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email') })),
  });
  return (
    <AuthShell title="Reset password" subtitle="We'll email you a reset link" footer={<Link to="/login" className="text-primary">Back to sign in</Link>}>
      {sent ? (
        <p className="text-center text-sm">If an account exists for that email, a reset link is on its way.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            try {
              await sendPasswordResetEmail(auth, email);
            } catch {
              /* don't reveal whether the account exists */
            }
            setSent(true);
          })}
        >
          <TextField label="Email" type="email" {...register('email')} error={formState.errors.email?.message} />
          <Button type="submit" block loading={formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
