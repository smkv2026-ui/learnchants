import { useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { driveConfigured, useDrive } from '@/lib/media/drive';
import { toast } from '@/stores/ui';
import { Badge, Button, Icon } from '@/components/ui';

/** Session Drive connection (no server: the token lives only in this tab). */
export function DriveConnect({ compact }: { compact?: boolean }) {
  const { token, expiresAt, connect, disconnect } = useDrive();
  const [busy, setBusy] = useState(false);
  const connected = !!token && expiresAt > Date.now();
  if (!driveConfigured()) {
    return (
      <p className="rounded-2xl bg-ink/5 p-3 text-sm text-muted">
        Google Drive isn't configured for this site, so files are kept in the built-in storage (up to 8 MB each).
        To store larger videos in your own Drive, add a Google OAuth client id and API key (README → “Optional: Google Drive”).
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone={connected ? 'success' : 'neutral'}>
        <Icon name="drive" size={12} /> {connected ? 'Drive connected for this session' : 'Drive not connected'}
      </Badge>
      {connected ? (
        <Button size="sm" variant="ghost" onClick={disconnect}>Disconnect</Button>
      ) : (
        <Button
          size={compact ? 'sm' : 'md'}
          icon="drive"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await connect();
              toast.success('Google Drive connected');
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Connect Google Drive
        </Button>
      )}
    </div>
  );
}
