import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { toast, useUi } from '@/stores/ui';
import { usePwa } from '@/stores/pwa';
import { Button, Card, Switch, TextField } from '@/components/ui';
import { Page } from '@/components/layout/Page';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useUi();
  const { installEvent, installed, install } = usePwa();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user || name.trim().length < 2) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: name.trim() });
      await setDoc(doc(db, 'users', user.uid), { displayName: name.trim() }, { merge: true });
      await auth.currentUser?.reload();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Profile">
      <h1 className="mb-6 text-4xl font-semibold">Profile & settings</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-4 p-6">
          <h2 className="text-xl font-semibold">Your details</h2>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <TextField label="Email" value={user?.email ?? ''} disabled />
          <Button onClick={() => void save()} loading={saving} disabled={name.trim() === (user?.displayName ?? '')}>
            Save
          </Button>
        </Card>
        <Card className="space-y-5 p-6">
          <h2 className="text-xl font-semibold">Preferences</h2>
          <Switch checked={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} label="Dark theme" description="Deep maroon & indigo, easy on the eyes." />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Install the app</p>
              <p className="text-sm text-muted">{installed ? 'Installed on this device.' : 'Add Learn Chants to your home screen.'}</p>
            </div>
            <Button variant="secondary" size="sm" disabled={!installEvent || installed} onClick={() => void install()}>
              Install
            </Button>
          </div>
          <p className="text-xs text-muted">On iPhone: tap Share → “Add to Home Screen”.</p>
        </Card>
      </div>
      <Button
        className="mt-8"
        variant="ghost"
        icon="logout"
        onClick={async () => {
          await logout();
          navigate('/');
        }}
      >
        Sign out
      </Button>
    </Page>
  );
}
