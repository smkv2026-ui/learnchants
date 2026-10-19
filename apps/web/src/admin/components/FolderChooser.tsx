import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { toast } from '@/stores/ui';
import { Button, TextField } from '@/components/ui';
import { pickDriveFolder, pickerAvailable } from './picker';

export interface FolderChoice {
  folderId?: string;
  folderName?: string;
}

/**
 * Lets an admin choose a Drive folder with Google Picker, or name a new top-level
 * folder (always available; the only option in MOCK_DRIVE mode).
 */
export function FolderChooser({ mock, busy, onChoose }: { mock: boolean; busy?: boolean; onChoose: (c: FolderChoice) => void }) {
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  return (
    <div className="space-y-3">
      {!mock && pickerAvailable() && (
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
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onChoose({ folderName: name.trim() });
        }}
      >
        <TextField
          className="flex-1"
          label={mock ? 'Folder name (local mock storage)' : 'Or create a new folder in My Drive'}
          placeholder="e.g. LearnChants 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
        <Button type="submit" variant="outline" disabled={!name.trim()} loading={busy}>
          Use this folder
        </Button>
      </form>
    </div>
  );
}
