import { collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { timeAgo } from '@/lib/format';
import type { AuditLog } from '@/lib/types';
import { useCollection } from '@/hooks/useFirestore';
import { EmptyState, ListSkeleton } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';

export default function AuditPage() {
  const logs = useCollection<AuditLog>(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(300)), 'audit');
  return (
    <>
      <AdminHeader title="Audit log" subtitle="Admin actions (visible to admins only)." />
      {logs.loading ? (
        <ListSkeleton />
      ) : logs.data.length === 0 ? (
        <EmptyState art="scroll" title="No admin actions yet" />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b hairline text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id} className="border-b hairline last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{timeAgo(l.createdAt)}</td>
                  <td className="px-4 py-2.5">{l.actorEmail ?? l.actorUid}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{l.target ? Object.entries(l.target).map(([k, v]) => `${k}=${String(v)}`).join(' ') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
