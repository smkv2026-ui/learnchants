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
        <>
        <ul className="space-y-2 md:hidden">
          {logs.data.map((l) => (
            <li key={l.id} className="glass rounded-2xl p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-primary">{l.action}</span>
                <span className="text-xs text-muted">{timeAgo(l.createdAt)}</span>
              </div>
              <p className="mt-1 truncate">{l.actorEmail ?? l.actorUid}</p>
              {l.target && Object.keys(l.target).length > 0 && (
                <p className="mt-0.5 break-all font-mono text-[11px] text-muted">{Object.entries(l.target).map(([k, v]) => `${k}=${String(v)}`).join(' ')}</p>
              )}
            </li>
          ))}
        </ul>
        <div className="glass hidden overflow-x-auto rounded-3xl md:block">
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
        </>
      )}
    </>
  );
}
