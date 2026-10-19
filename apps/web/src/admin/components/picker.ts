// Google Picker for choosing a Drive folder. Uses the teacher's session token
// (scope drive.file); picking a folder grants this app access to it.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { googleApiKey, loadScript, useDrive } from '@/lib/media/drive';

const env = import.meta.env;

export async function pickDriveFolder(): Promise<{ id: string; name: string } | null> {
  const accessToken = await useDrive.getState().connect();
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((r) => window.gapi.load('picker', () => r()));
  const g = window.google.picker;
  return new Promise((resolve) => {
    const view = new g.DocsView(g.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');
    new g.PickerBuilder()
      .setTitle('Choose where Learn Chants stores media')
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(googleApiKey())
      .setAppId(env.VITE_GOOGLE_APP_ID || '')
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED) resolve({ id: data.docs[0].id, name: data.docs[0].name });
        else if (data.action === g.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
