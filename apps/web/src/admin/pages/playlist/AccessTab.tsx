import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { revokeAccess } from '@/lib/ops/payments';
import { timeAgo } from '@/lib/format';
import type { Playlist, TS, WithId } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useCollection, useDoc } from '@/hooks/useFirestore';
import { Button, Card, EmptyState, ListSkeleton, Modal, TextField } from '@/components/ui';

function LearnerName({ uid }: { uid: string }) {
  const u = useDoc<{ displayName?: string; email?: string }>(doc(db, 'users', uid));
  return (
    <Link to={`/admin/learners/${uid}`} className="hover:text-primary">
      <span className="font-medium">{u.data?.displayName ?? 'Learner'}</span>
      <span className="block text-xs text-muted">{u.data?.email}</span>
    </Link>
  );
}

export function AccessTab({ pid, playlist }: { pid: string; playlist: WithId<Playlist> }) {
  const grants = useCollection<{ uid: string; grantedAt?: TS; source?: string }>(query(collection(db, 'accessGrants'), where('pid', '==', pid)), `grants-pid-${pid}`);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (playlist.access !== 'paid') {
    return <EmptyState title="Free playlist" message="Everyone who signs in can learn this playlist. Switch to Paid in Details to manage access." />;
  }
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-2xl font-semibold">Learners with access ({grants.data.length})</h2>
      {grants.loading ? (
        <ListSkeleton rows={3} />
      ) : grants.data.length === 0 ? (
        <p className="text-sm text-muted">Nobody yet. Approve payment requests in Payments to grant access.</p>
      ) : (
        <ul className="divide-y divide-ink/10">
          {grants.data.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><LearnerName uid={g.uid} /></div>
              <span className="hidden text-xs text-muted sm:block">granted {timeAgo(g.grantedAt)}</span>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRevoking(g.uid)}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke access?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!revoking) return;
                setBusy(true);
                try {
                  await revokeAccess(revoking, pid, playlist.title, reason.trim() || undefined);
                  toast.success('Access revoked');
                  setRevoking(null);
                  setReason('');
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revoke
            </Button>
          </>
        }
      >
        <TextField label="Reason (shown to the learner, optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Modal>
    </Card>
  );
}
