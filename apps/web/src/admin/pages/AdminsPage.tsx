import { useState } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { AdminUser, WithId } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { useCollection } from '@/hooks/useFirestore';
import { Badge, Button, Card, Icon, ListSkeleton, Modal, TextField } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function AdminsPage() {
  const { user, role } = useAuth();
  const admins = useCollection<AdminUser>(collection(db, 'adminUsers'), 'admin-list');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<WithId<AdminUser> | null>(null);

  const invite = async () => {
    setBusy(true);
    try {
      setLink(await api.createAdminInvite(email.trim() ? { email: email.trim() } : {}));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (a: WithId<AdminUser>) => {
    try {
      await api.deactivateAdmin({ uid: a.id, active: a.status !== 'active' });
      toast.success(a.status === 'active' ? 'Admin deactivated' : 'Admin reactivated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <AdminHeader
        title="Admins"
        subtitle="Teachers who can author content, review learners and approve payments. Learners never see who they are."
        actions={<Button icon="plus" onClick={() => { setInviteOpen(true); setLink(null); setEmail(''); }}>Invite admin</Button>}
      />
      {admins.loading ? (
        <ListSkeleton />
      ) : (
        <ul className="space-y-2.5">
          {admins.data.map((a) => {
            const self = a.id === user?.uid;
            return (
              <li key={a.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 font-semibold text-primary">{(a.displayName ?? a.email ?? '?').slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.displayName} {self && <span className="text-xs text-muted">(you)</span>}</p>
                    <p className="text-xs text-muted">{a.email} · since {timeAgo(a.createdAt)}</p>
                  </div>
                  <Badge tone={a.role === 'SUPER_ADMIN' ? 'gold' : 'indigo'}>{a.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</Badge>
                  <Badge tone={a.status === 'active' ? 'success' : 'danger'}>{a.status}</Badge>
                  {!self && a.role !== 'SUPER_ADMIN' && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void toggle(a)}>{a.status === 'active' ? 'Deactivate' : 'Reactivate'}</Button>
                      {role === 'SUPER_ADMIN' && (
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(a)}>Remove</Button>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite an admin">
        {link ? (
          <div className="space-y-3">
            <p className="text-sm">Share this single-use link privately. It expires {new Date(link.expiresAt).toLocaleDateString()}.</p>
            <div className="flex gap-2">
              <input readOnly className="input font-mono text-xs" value={link.link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <Button icon="copy" onClick={() => navigator.clipboard?.writeText(link.link).then(() => toast.success('Link copied'))}>Copy</Button>
            </div>
            <p className="flex items-center gap-1 text-xs text-muted"><Icon name="shield" size={14} /> The invitee signs in, opens the link and accepts.</p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void invite(); }}>
            <TextField label="Restrict to email (recommended)" type="email" placeholder="teacher@example.org" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" loading={busy} icon="link">Create invite link</Button>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Remove ${removing?.displayName ?? 'admin'}?`}
        confirmLabel="Remove admin"
        message="They lose admin access immediately and become a regular learner account. Their playlists stay published."
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api.removeAdmin({ uid: removing.id });
            toast.success('Admin removed');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </>
  );
}
