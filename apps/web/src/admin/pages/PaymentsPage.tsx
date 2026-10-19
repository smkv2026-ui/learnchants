import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api, errorMessage } from '@/lib/api';
import { formatInr } from '@/lib/upi';
import { timeAgo } from '@/lib/format';
import type { PaymentRequest, WithId } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { useCollection } from '@/hooks/useFirestore';
import { Badge, Button, Card, EmptyState, Icon, ListSkeleton, Modal, Spinner, Tabs, TextField } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';

function Screenshot({ mediaId }: { mediaId: string }) {
  const url = useMediaUrl(mediaId);
  if (url.isLoading) return <Spinner />;
  if (!url.data) return <p className="text-sm text-danger">Screenshot unavailable</p>;
  return <img src={url.data.url} alt="Payment screenshot submitted by the learner" className="max-h-[70vh] w-full rounded-2xl object-contain" />;
}

export default function PaymentsPage() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const reqs = useCollection<PaymentRequest>(
    query(collection(db, 'paymentRequests'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(200)),
    `payments-${status}`,
  );
  const [shot, setShot] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<WithId<PaymentRequest> | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (r: WithId<PaymentRequest>, decision: 'APPROVED' | 'REJECTED', why?: string) => {
    setBusy(r.id);
    try {
      await api.reviewPayment({ requestId: r.id, decision, reason: why });
      toast.success(decision === 'APPROVED' ? `Access granted to ${r.userName ?? 'learner'}` : 'Request rejected');
      setRejecting(null);
      setReason('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AdminHeader title="Payments" subtitle="Verify the UPI reference in your bank / UPI app before approving." />
      <Tabs className="mb-5" items={[{ id: 'PENDING', label: 'Pending' }, { id: 'APPROVED', label: 'Approved' }, { id: 'REJECTED', label: 'Rejected' }]} value={status} onChange={setStatus} />
      {reqs.loading ? (
        <ListSkeleton />
      ) : reqs.data.length === 0 ? (
        <EmptyState art="diya" title={status === 'PENDING' ? 'No pending payments' : 'Nothing here yet'} />
      ) : (
        <ul className="space-y-3">
          {reqs.data.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <Link to={`/admin/learners/${r.uid}`} className="hover:text-primary">{r.userName ?? 'Learner'}</Link>
                    <span className="font-normal text-muted"> · {r.playlistTitle}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-base">{r.reference}</span>
                    <Badge tone="gold">{formatInr(r.amount)}</Badge>
                    {r.duplicateFlag && <Badge tone="warn"><Icon name="alert" size={12} /> reference used before</Badge>}
                    <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
                  </p>
                  {r.reason && <p className="mt-1 text-sm text-danger">Reason: {r.reason}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.screenshotMediaId && (
                    <Button size="sm" variant="secondary" icon="eye" onClick={() => setShot(r.screenshotMediaId!)}>Screenshot</Button>
                  )}
                  {status === 'PENDING' && (
                    <>
                      <Button size="sm" icon="check" loading={busy === r.id} onClick={() => void decide(r, 'APPROVED')}>Approve</Button>
                      <Button size="sm" variant="outline" icon="x" disabled={busy === r.id} onClick={() => setRejecting(r)}>Reject</Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!shot} onClose={() => setShot(null)} title="Payment screenshot" size="lg">
        {shot && <Screenshot mediaId={shot} />}
      </Modal>
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject payment"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" disabled={!reason.trim()} loading={busy === rejecting?.id} onClick={() => rejecting && void decide(rejecting, 'REJECTED', reason.trim())}>
              Reject
            </Button>
          </>
        }
      >
        <TextField label="Reason (shown to the learner)" placeholder="Reference not found in our account" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <p className="mt-2 text-xs text-muted">The learner can correct it and submit again.</p>
      </Modal>
    </>
  );
}
