import { useState } from 'react';
import { errorMessage } from '@/lib/errors';
import type { FolderChoice } from '@/lib/ops/storage';
import { toast } from '@/stores/ui';
import { Button, TextField } from '@/components/ui';
import { pickDriveFolder } from './picker';

export type { FolderChoice };

/** Pick a Drive folder with Google Picker, or name a new top-level folder. */
export function FolderChooser({ busy, onChoose }: { busy?: boolean; onChoose: (c: FolderChoice) => void }) {
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        icon="drive"
        loading={picking}
        disabled={busy}
        onClick={async () => {
          setPicking(true);
          try {
            const f = await pickDriveFolder();
            if (f) onChoose({ folderId: f.id, folderName: f.name });
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setPicking(false);
          }
        }}
      >
        Choose a Drive folder…
      </Button>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onChoose({ folderName: name.trim() });
        }}
      >
        <TextField className="flex-1" label="Or create a new folder in My Drive" placeholder="e.g. LearnChants 2026" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <Button type="submit" variant="outline" disabled={!name.trim()} loading={busy}>
          Use this folder
        </Button>
      </form>
    </div>
  );
}
