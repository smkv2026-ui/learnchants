import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { MAX_FIRESTORE_BYTES, deleteMedia, deleteVerseMedia, storeMedia } from '@/lib/media';
import { driveConfigured, driveConnected, useDrive } from '@/lib/media/drive';
import { DriveConnect } from '../components/DriveConnect';
import { recountVerses } from '@/lib/ops/content';
import { buildTree, byOrder, flatten } from '@/lib/tree';
import { useNodes, usePlaylist, useVerses } from '@/hooks/useLearner';
import { toast } from '@/stores/ui';
import { Breadcrumbs, Button, Card, EmptyState, Icon, Skeleton, TextField } from '@/components/ui';
import { MediaInput } from '@/components/media/MediaInput';
import { LoopPlayer } from '@/components/media/LoopPlayer';
import type { Recording } from '@/components/media/Recorder';
import { UploadProgress } from '@/components/media/UploadProgress';
import { AdminHeader } from '../components/AdminLayout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RichTextEditor } from '../components/RichTextEditor';

const EMPTY = { name: '', firstLine: '', details: '' };

export default function VerseEditorPage() {
  const { pid, vid } = useParams<{ pid: string; vid?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const playlist = usePlaylist(pid);
  const nodes = useNodes(pid);
  const verses = useVerses(pid);
  const existing = vid ? verses.data.find((v) => v.id === vid) : undefined;
  const flat = useMemo(() => flatten(buildTree(nodes.data)), [nodes.data]);
  const [nodeId, setNodeId] = useState(params.get('node') ?? '');
  const [form, setForm] = useState(EMPTY);
  const [audio, setAudio] = useState<Recording | null>(null);
  const [video, setVideo] = useState<Recording | null>(null);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const loadedFor = useRef<string | null>(null);
  useDrive((s) => s.token); // re-render when Drive connects (changes size limits/destination)

  // Load existing verse once.
  useEffect(() => {
    if (existing && loadedFor.current !== existing.id) {
      loadedFor.current = existing.id;
      setForm({ name: existing.name, firstLine: existing.firstLine ?? '', details: existing.details ?? '' });
      setNodeId(existing.nodeId);
    }
  }, [existing]);

  // Suggest "Verse N" for a new verse in the chosen section.
  useEffect(() => {
    if (vid || form.name || !nodeId) return;
    const n = verses.data.filter((v) => v.nodeId === nodeId).length + 1;
    setForm((f) => ({ ...f, name: `Verse ${n}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, vid, verses.data.length]);

  if (playlist.loading || nodes.loading || verses.loading) return <Skeleton className="h-96 w-full rounded-3xl" />;
  if (!pid || !playlist.data) return <EmptyState title="Playlist not found" />;
  if (vid && !existing) return <EmptyState title="Verse not found" action={<Link to={`/admin/playlists/${pid}`}><Button>Back</Button></Link>} />;
  if (!flat.length) {
    return (
      <EmptyState
        art="scroll"
        title="Create sections first"
        message="Verses live inside sections. Build the classification tree, then add verses."
        action={<Link to={`/admin/playlists/${pid}?tab=structure`}><Button>Build structure</Button></Link>}
      />
    );
  }

  const save = async (addNext: boolean) => {
    if (!form.name.trim() || !nodeId) return toast.error('Choose a section and enter a verse name.');
    setSaving(true);
    try {
      const ref = vid ? doc(db, 'playlists', pid, 'verses', vid) : doc(collection(db, 'playlists', pid, 'verses'));
      const base = { nodeId, name: form.name.trim(), firstLine: form.firstLine.trim(), details: form.details, updatedAt: serverTimestamp() };
      if (vid) {
        await updateDoc(ref, base);
      } else {
        const order = verses.data.filter((v) => v.nodeId === nodeId).reduce((m, v) => Math.max(m, v.order ?? 0), 0) + 1;
        await setDoc(ref, { ...base, order, hasAudio: false, hasVideo: false, createdAt: serverTimestamp() });
      }
      if (!vid || existing?.nodeId !== nodeId) await recountVerses(pid);
      for (const [rec, kind] of [[audio, 'audio'], [video, 'video']] as const) {
        if (!rec) continue;
        const label = `Uploading ${kind}${driveConnected() ? ' to Google Drive' : ''}`;
        setProgress({ label, value: 0 });
        const mediaId = await storeMedia(
          rec.blob,
          { purpose: kind === 'audio' ? 'verse_audio' : 'verse_video', pid, vid: ref.id, kind, mimeType: rec.mimeType, fileName: rec.fileName },
          { onProgress: (v) => setProgress({ label, value: v }), durationSec: rec.durationSec, useDrive: true },
        );
        const previous = kind === 'audio' ? existing?.audioMediaId : existing?.videoMediaId;
        await updateDoc(ref, kind === 'audio'
          ? { audioMediaId: mediaId, hasAudio: true, audioMime: rec.mimeType }
          : { videoMediaId: mediaId, hasVideo: true, videoMime: rec.mimeType });
        if (previous && previous !== mediaId) await deleteMedia(previous).catch(() => undefined);
      }
      toast.success(vid ? 'Verse updated' : 'Verse saved');
      setAudio(null);
      setVideo(null);
      if (addNext) {
        setForm(EMPTY);
        setResetKey((k) => k + 1);
        navigate(`/admin/playlists/${pid}/verses/new?node=${nodeId}`, { replace: !vid });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (!vid) {
        navigate(`/admin/playlists/${pid}/verses/${ref.id}`, { replace: true });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const siblings = verses.data.filter((v) => v.nodeId === nodeId).sort(byOrder);

  return (
    <div key={`${vid ?? 'new'}-${resetKey}`}>
      <Breadcrumbs
        items={[
          { label: 'Playlists', to: '/admin/playlists' },
          { label: playlist.data.title, to: `/admin/playlists/${pid}` },
          { label: vid ? form.name || 'Verse' : 'New verse' },
        ]}
      />
      <AdminHeader title={vid ? 'Edit verse' : 'Add verse'} subtitle={nodeId ? `in ${nodes.data.find((n) => n.id === nodeId)?.name ?? ''}` : undefined} />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="verse-node">Section</label>
                <select id="verse-node" className="input" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
                  <option value="" disabled>Choose a section…</option>
                  {flat.map((n) => (
                    <option key={n.id} value={n.id}>{'— '.repeat(n.depth)}{n.name}</option>
                  ))}
                </select>
              </div>
              <TextField label="Verse name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={120} />
            </div>
            <TextField
              label="First line (optional, shown in lists)"
              lang="sa"
              className="font-chant"
              placeholder="नमस्ते रुद्र मन्यव…"
              value={form.firstLine}
              onChange={(e) => setForm((f) => ({ ...f, firstLine: e.target.value }))}
              maxLength={200}
            />
            <RichTextEditor
              label="Details / meaning of the shloka"
              value={form.details}
              onChange={(details) => setForm((f) => ({ ...f, details }))}
              placeholder="Text in Devanagari, transliteration, word meanings, translation…"
            />
          </Card>

          <Card className="space-y-4 p-6">
            {driveConfigured() && <DriveConnect compact />}
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Icon name="mic" className="text-primary" /> Audio</h2>
            <MediaInput kind="audio" value={audio} onChange={setAudio} hasExisting={!!existing?.hasAudio} maxBytes={driveConnected() ? 200 * 1024 * 1024 : MAX_FIRESTORE_BYTES} />
          </Card>
          <Card className="space-y-4 p-6">
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Icon name="video" className="text-primary" /> Video <span className="text-sm font-normal text-muted">(optional)</span></h2>
            <MediaInput kind="video" value={video} onChange={setVideo} hasExisting={!!existing?.hasVideo} maxBytes={driveConnected() ? 1024 * 1024 * 1024 : MAX_FIRESTORE_BYTES} />
          </Card>

          {progress && <UploadProgress value={progress.value} label={progress.label} />}

          <div className="glass sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <Button icon="check" loading={saving} onClick={() => void save(false)}>Save</Button>
            <Button variant="secondary" icon="plus" disabled={saving} onClick={() => void save(true)}>Save and add next verse</Button>
            {vid && (
              <Button variant="ghost" icon="trash" className="ml-auto text-danger" disabled={saving} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {existing && (existing.hasAudio || existing.hasVideo) && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Icon name="eye" className="text-primary" /> Learner preview</h2>
              <LoopPlayer
                key={`${existing.audioMediaId}-${existing.videoMediaId}`}
                audioMediaId={existing.hasAudio ? existing.audioMediaId : null}
                videoMediaId={existing.hasVideo ? existing.videoMediaId : null}
                autoPlay={false}
                compact
              />
            </div>
          )}
          {nodeId && (
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Verses in this section</h3>
              {siblings.length === 0 ? (
                <p className="text-sm text-muted">This will be the first verse.</p>
              ) : (
                <ol className="space-y-1">
                  {siblings.map((v, i) => (
                    <li key={v.id}>
                      <Link
                        to={`/admin/playlists/${pid}/verses/${v.id}`}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5 ${v.id === vid ? 'bg-primary/10 text-primary' : ''}`}
                      >
                        <span className="w-5 text-muted">{i + 1}.</span>
                        <span className="flex-1 truncate">{v.name}</span>
                        {v.hasAudio && <Icon name="music" size={14} className="text-success" />}
                        {v.hasVideo && <Icon name="video" size={14} className="text-indigo-400" />}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="Delete this verse?"
        confirmLabel="Delete"
        message="Its audio and video files are moved to the Drive trash. Learners' past submissions are kept."
        onConfirm={async () => {
          await deleteVerseMedia(pid, vid!).catch(() => undefined);
          await deleteDoc(doc(db, 'playlists', pid, 'verses', vid!));
          await recountVerses(pid);
          toast.success('Verse deleted');
          navigate(`/admin/playlists/${pid}`);
        }}
      />
    </div>
  );
}
