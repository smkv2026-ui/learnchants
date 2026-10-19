import { Link, useParams, useSearchParams } from 'react-router-dom';
import { usePlaylist } from '@/hooks/useLearner';
import { Badge, Breadcrumbs, Button, EmptyState, Skeleton, Tabs } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';
import { DetailsTab } from './playlist/DetailsTab';
import { StructureTab } from './playlist/StructureTab';
import { MaterialsTab } from './playlist/MaterialsTab';
import { StorageTab } from './playlist/StorageTab';
import { AccessTab } from './playlist/AccessTab';

type Tab = 'details' | 'structure' | 'materials' | 'storage' | 'access';

export default function PlaylistEditorPage() {
  const { pid } = useParams<{ pid: string }>();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'structure';
  const playlist = usePlaylist(pid);

  if (playlist.loading) return <Skeleton className="h-96 w-full rounded-3xl" />;
  if (!playlist.data || !pid)
    return <EmptyState title="Playlist not found" action={<Link to="/admin/playlists"><Button>All playlists</Button></Link>} />;

  const p = playlist.data;
  return (
    <>
      <Breadcrumbs items={[{ label: 'Playlists', to: '/admin/playlists' }, { label: p.title }]} />
      <AdminHeader
        title={p.title}
        subtitle={
          <span className="flex flex-wrap gap-2">
            {p.published ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
            <Badge tone={p.access === 'paid' ? 'gold' : 'indigo'}>{p.access === 'paid' ? 'Paid' : 'Free'}</Badge>
            <Badge>{p.verseCount ?? 0} verses</Badge>
          </span>
        }
      />
      <Tabs
        className="mb-6"
        items={[
          { id: 'structure', label: 'Structure & verses', icon: 'list' },
          { id: 'details', label: 'Details', icon: 'edit' },
          { id: 'materials', label: 'Materials', icon: 'file' },
          { id: 'storage', label: 'Storage', icon: 'drive' },
          { id: 'access', label: 'Access', icon: 'unlock' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />
      {tab === 'details' && <DetailsTab pid={pid} playlist={p} />}
      {tab === 'structure' && <StructureTab pid={pid} />}
      {tab === 'materials' && <MaterialsTab pid={pid} />}
      {tab === 'storage' && <StorageTab pid={pid} />}
      {tab === 'access' && <AccessTab pid={pid} playlist={p} />}
    </>
  );
}
