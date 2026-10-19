// Google Picker for choosing a Drive folder (scope drive.file). The browser gets
// its own short-lived token via Google Identity Services just for the Picker;
// the long-lived refresh token stays server-side. Choosing a folder in the
// Picker grants this app (same OAuth client / app id) access to it.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

const env = import.meta.env;

export function pickerAvailable(): boolean {
  return !!(env.VITE_GOOGLE_CLIENT_ID && env.VITE_GOOGLE_API_KEY);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function token(): Promise<string> {
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (res: { access_token?: string; error?: string }) =>
        res.access_token ? resolve(res.access_token) : reject(new Error(res.error || 'Authorisation cancelled')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export async function pickDriveFolder(): Promise<{ id: string; name: string } | null> {
  const accessToken = await token();
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((r) => window.gapi.load('picker', () => r()));
  const g = window.google.picker;
  return new Promise((resolve) => {
    const view = new g.DocsView(g.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');
    const picker = new g.PickerBuilder()
      .setTitle('Choose where Learn Chants stores media')
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(env.VITE_GOOGLE_API_KEY)
      .setAppId(env.VITE_GOOGLE_APP_ID || '')
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED) {
          const doc = data.docs[0];
          resolve({ id: doc.id, name: doc.name });
        } else if (data.action === g.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
