import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { api, errorMessage } from '@/lib/api';
import { uploadMedia } from '@/lib/upload';
import { buildUpiLink, formatInr } from '@/lib/upi';
import { timeAgo } from '@/lib/format';
import { celebrate } from '@/lib/celebrate';
import type { PaymentInfo } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { useHasAccess, useMyPaymentRequests, usePlaylist } from '@/hooks/useLearner';
import { Badge, Breadcrumbs, Button, Card, EmptyState, Icon, Skeleton, TextField } from '@/components/ui';
import { Page } from '@/components/layout/Page';
import { UploadProgress } from '@/components/media/UploadProgress';

const schema = z.object({
  reference: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]{6,40}$/, 'Enter the UPI reference / UTR number shown in your payment app')),
});

export default function PaymentPage() {
  const { pid } = useParams<{ pid: string }>();
  const navigate = useNavigate();
  const playlist = usePlaylist(pid);
  const info = useDoc<PaymentInfo>(pid ? doc(db, 'playlists', pid, 'payment', 'info') : null);
  const requests = useMyPaymentRequests(pid);
  const { access, loading: accessLoading } = useHasAccess(pid, playlist.data);
  const [shot, setShot] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, formState, reset } = useForm<{ reference: string }>({ resolver: zodResolver(schema) });

  if (playlist.loading || info.loading || accessLoading) {
    return (
      <Page>
        <Skeleton className="h-96 w-full rounded-4xl" />
      </Page>
    );
  }
  const p = playlist.data;
  if (!p || p.access !== 'paid') {
    return (
      <Page title="Payment">
        <EmptyState title="No payment needed" message="This playlist is free to learn." action={<Link to={pid ? `/p/${pid}` : '/'}><Button>Open playlist</Button></Link>} />
      </Page>
    );
  }
  if (access) {
    return (
      <Page title="Unlocked">
        <EmptyState art="diya" title="You're all set!" message="This playlist is unlocked for you." action={<Link to={`/p/${pid}`}><Button icon="play">Start learning</Button></Link>} />
      </Page>
    );
  }

  const amount = Number(p.price ?? 0);
  const link = info.data ? buildUpiLink({ upiId: info.data.upiId, payeeName: info.data.payeeName, amount, note: `Learn Chants: ${p.title}` }) : '';
  const sorted = [...requests.data].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  const pending = sorted.find((r) => r.status === 'PENDING');

  const onSubmit = handleSubmit(async ({ reference }) => {
    if (!pid) return;
    try {
      let screenshotMediaId: string | undefined;
      if (shot) {
        setProgress(0);
        const res = await uploadMedia(shot, { purpose: 'payment_screenshot', playlistId: pid, fileName: shot.name }, { onProgress: setProgress });
        screenshotMediaId = res.mediaId;
      }
      const res = await api.submitPaymentRequest({ playlistId: pid, reference, screenshotMediaId });
      toast.success(res.duplicateFlag ? 'Submitted. This reference was used before, so the review may take a little longer.' : 'Payment submitted for review.');
      celebrate();
      reset();
      setShot(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  });

  return (
    <Page title={`Unlock ${p.title}`}>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: p.title, to: `/p/${pid}` }, { label: 'Unlock' }]} />
      <h1 className="mb-2 text-4xl font-semibold">Unlock {p.title}</h1>
      <p className="mb-8 text-muted">One-time payment of {formatInr(amount)} for lifetime access. Pay using any UPI app, then share the reference number.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="mandala-bg p-6 text-center">
          {!info.data ? (
            <p className="text-sm text-muted">Payment details are not configured yet. Please check back later.</p>
          ) : (
            <>
              <p className="text-sm uppercase tracking-[.25em] text-muted">Amount</p>
              <p className="text-gold-gradient num text-5xl font-bold sm:text-6xl">{formatInr(amount)}</p>
              <div className="mx-auto my-6 w-fit rounded-3xl bg-white p-4 shadow-glow">
                <QRCodeSVG value={link} size={196} level="M" fgColor="#2e0e1a" aria-label="UPI payment QR code" />
              </div>
              <a href={link} className="block sm:inline-block">
                <Button size="lg" icon="send" block>Pay with UPI app</Button>
              </a>
              <div className="mt-6 space-y-2 text-left text-sm">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2">
                  <span className="text-muted">UPI ID</span>
                  <span className="flex items-center gap-2 font-mono">
                    {info.data.upiId}
                    <button
                      aria-label="Copy UPI ID"
                      className="rounded p-1 hover:bg-ink/10"
                      onClick={() => navigator.clipboard?.writeText(info.data!.upiId).then(() => toast.success('UPI ID copied'))}
                    >
                      <Icon name="copy" size={16} />
                    </button>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2">
                  <span className="text-muted">Payee</span>
                  <span>{info.data.payeeName}</span>
                </div>
              </div>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-2xl font-semibold">Confirm your payment</h2>
            <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Pay {formatInr(amount)} by scanning the QR or tapping “Pay with UPI app”.</li>
              <li>Copy the UPI reference / UTR / transaction ID from your app.</li>
              <li>Submit it below. A teacher verifies it and unlocks the playlist.</li>
            </ol>
            {pending ? (
              <div className="rounded-2xl bg-indigo-400/10 p-4 text-sm">
                <p className="font-semibold">Awaiting verification</p>
                <p className="text-muted">Reference {pending.reference} · submitted {timeAgo(pending.createdAt)}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <TextField
                  label="Payment reference number"
                  placeholder="e.g. 412356789012"
                  inputMode="text"
                  autoComplete="off"
                  {...register('reference')}
                  error={formState.errors.reference?.message}
                />
                <div>
                  <span className="label">Screenshot (optional)</span>
                  <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                      {shot ? 'Change image' : 'Attach image'}
                    </Button>
                    {shot && <span className="truncate text-sm text-muted">{shot.name}</span>}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 10 * 1024 * 1024) toast.error('Image must be under 10 MB.');
                      else setShot(f ?? null);
                    }}
                  />
                </div>
                <UploadProgress value={progress} label="Uploading screenshot" />
                <Button type="submit" block size="lg" loading={formState.isSubmitting}>
                  Submit for verification
                </Button>
              </form>
            )}
          </Card>

          {sorted.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-3 text-lg font-semibold">Your requests</h3>
              <ul className="space-y-2 text-sm">
                {sorted.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2">
                    <span className="font-mono">{r.reference}</span>
                    <span className="text-muted">{timeAgo(r.createdAt)}</span>
                    <Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'indigo'}>{r.status.toLowerCase()}</Badge>
                    {r.status === 'REJECTED' && r.reason && <p className="w-full text-xs text-danger">{r.reason}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Button variant="ghost" icon="chevron-left" onClick={() => navigate(`/p/${pid}`)}>
            Back to playlist
          </Button>
        </div>
      </div>
    </Page>
  );
}
