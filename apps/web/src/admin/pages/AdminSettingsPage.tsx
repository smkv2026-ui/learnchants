import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { api, errorMessage } from '@/lib/api';
import { isValidUpiId } from '@/lib/upi';
import { useAuth } from '@/stores/auth';
import { toast, useUi } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { Badge, Button, Card, Icon, Skeleton, Switch, TextField } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';
import { FolderChooser, type FolderChoice } from '../components/FolderChooser';

interface Settings {
  defaultFolderName?: string;
  driveStatus?: string;
  displayName?: string;
  upiId?: string;
  payeeName?: string;
}

export default function AdminSettingsPage() {
  const uid = useAuth((s) => s.user?.uid);
  const { theme, setTheme } = useUi();
  const [params, setParams] = useSearchParams();
  const settings = useDoc<Settings>(uid ? doc(db, 'adminSettings', uid) : null);
  const status = useQuery({ queryKey: ['drive-status'], queryFn: () => api.driveStatus({}) });
  const [busy, setBusy] = useState(false);
  const [moveExisting, setMoveExisting] = useState(false);
  const [prefs, setPrefs] = useState({ displayName: '', upiId: '', payeeName: '' });

  useEffect(() => {
    const d = params.get('drive');
    if (d === 'connected') toast.success('Google Drive connected');
    if (d === 'error') toast.error('Could not connect Google Drive. Please try again.');
    if (d) {
      params.delete('drive');
      setParams(params, { replace: true });
      void status.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settings.data) setPrefs({ displayName: settings.data.displayName ?? '', upiId: settings.data.upiId ?? '', payeeName: settings.data.payeeName ?? '' });
  }, [settings.data]);

  const mock = !!status.data?.mock;
  const driveState = mock ? 'connected' : settings.data?.driveStatus ?? status.data?.status ?? 'disconnected';

  const connect = async () => {
    setBusy(true);
    try {
      const res = await api.driveAuthUrl({});
      if (res.url) window.location.href = res.url;
      else toast.info('Mock Drive mode: files are stored locally, no connection needed.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (c: FolderChoice) => {
    setBusy(true);
    try {
      const res = await api.setStorageLocation({ scope: 'default', ...c, moveExisting });
      toast.success(`New uploads will go to “${res.folderName}”${res.moved ? ` (${res.moved} playlist folders moved)` : ''}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    if (!uid) return;
    if (prefs.upiId && !isValidUpiId(prefs.upiId)) return toast.error('Enter a valid UPI ID');
    try {
      await setDoc(doc(db, 'adminSettings', uid), prefs, { merge: true });
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <AdminHeader title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-2xl font-semibold"><Icon name="drive" className="text-primary" /> Google Drive</h2>
            {status.isLoading ? <Skeleton className="h-6 w-24" /> : (
              <Badge tone={driveState === 'connected' ? 'success' : driveState === 'needs_reconnect' ? 'danger' : 'neutral'}>
                {mock ? 'mock storage' : driveState.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted">
            Media for playlists you own is stored in your Drive using the limited <code>drive.file</code> permission: Learn Chants can only see files and folders it creates or that you pick.
            Tokens stay encrypted on the server.
          </p>
          {mock ? (
            <p className="rounded-2xl bg-warn/10 p-3 text-sm text-warn">MOCK_DRIVE is on: files are written to the local <code>.mock_drive/</code> folder (emulator / development only).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button icon="drive" loading={busy} onClick={() => void connect()}>
                {driveState === 'connected' ? 'Reconnect' : 'Connect Google Drive'}
              </Button>
              {driveState === 'connected' && (
                <Button variant="ghost" onClick={async () => { await api.driveDisconnect({}); toast.success('Disconnected'); void status.refetch(); }}>
                  Disconnect
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card className="space-y-5 p-6">
          <h2 className="text-2xl font-semibold">Default storage location</h2>
          <div className="rounded-2xl bg-ink/5 p-4">
            <p className="text-sm text-muted">New content goes to</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold"><Icon name="folder" className="text-primary" /> {settings.data?.defaultFolderName ?? 'LearnChants'} <span className="text-sm font-normal text-muted">/ Playlist / Section / … / Verse</span></p>
          </div>
          {(mock || driveState === 'connected') && (
            <>
              <FolderChooser mock={mock} busy={busy} onChoose={(c) => void choose(c)} />
              <Switch checked={moveExisting} onChange={setMoveExisting} label="Move existing files too" description="Off: only new uploads use the new location (playlists with their own override are not affected)." />
            </>
          )}
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-2xl font-semibold">Profile & UPI defaults</h2>
          <TextField label="Display name (visible to other admins only)" value={prefs.displayName} onChange={(e) => setPrefs((p) => ({ ...p, displayName: e.target.value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Default UPI ID" value={prefs.upiId} onChange={(e) => setPrefs((p) => ({ ...p, upiId: e.target.value }))} />
            <TextField label="Default payee name" value={prefs.payeeName} onChange={(e) => setPrefs((p) => ({ ...p, payeeName: e.target.value }))} />
          </div>
          <p className="text-xs text-warn">Payers see the UPI ID and payee name; prefer a neutral organisation/trust UPI ID.</p>
          <Button onClick={() => void savePrefs()}>Save</Button>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-2xl font-semibold">Appearance</h2>
          <Switch checked={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} label="Dark theme" />
        </Card>
      </div>
    </>
  );
}
