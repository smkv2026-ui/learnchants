import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export type UploadPurpose = 'verse_audio' | 'verse_video' | 'material' | 'submission' | 'reply' | 'payment_screenshot';

export interface UploadSessionReq {
  purpose: UploadPurpose;
  playlistId: string;
  verseId?: string;
  nodeId?: string;
  materialId?: string;
  submissionId?: string;
  mimeType: string;
  size: number;
  fileName?: string;
  kind?: 'audio' | 'video';
}

export const api = {
  initProfile: call<{ displayName?: string }, { role: string; refreshToken: boolean }>('init_profile'),
  createAdminInvite: call<{ email?: string }, { token: string; link: string; expiresAt: string }>('create_admin_invite'),
  acceptAdminInvite: call<{ token: string }, { role: string }>('accept_admin_invite'),
  deactivateAdmin: call<{ uid: string; active?: boolean }, { status: string }>('deactivate_admin'),
  removeAdmin: call<{ uid: string }, { removed: boolean }>('remove_admin'),
  driveAuthUrl: call<Record<string, never>, { mock: boolean; url: string | null }>('drive_auth_url'),
  driveStatus: call<Record<string, never>, { mock: boolean; status: string; defaultFolderName?: string }>('drive_status'),
  driveDisconnect: call<Record<string, never>, { status: string }>('drive_disconnect'),
  setStorageLocation: call<
    { scope: 'default' | 'playlist'; playlistId?: string; folderId?: string; folderName?: string; moveExisting?: boolean },
    { folderName: string | null; moved: number }
  >('set_storage_location'),
  moveStorage: call<{ playlistId: string }, { moved: number }>('move_storage'),
  createUploadSession: call<UploadSessionReq, { mediaId: string; uploadUrl: string; chunkSize: number }>('create_upload_session'),
  finalizeUpload: call<{ mediaId: string; durationSec?: number | null }, { mediaId: string; submissionId?: string }>('finalize_upload'),
  getMediaUrl: call<{ mediaId: string }, { url: string; expiresAt: number; mimeType?: string }>('get_media_url'),
  submitPaymentRequest: call<
    { playlistId: string; reference: string; screenshotMediaId?: string },
    { requestId: string; status: string; duplicateFlag: boolean }
  >('submit_payment_request'),
  reviewPayment: call<{ requestId: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }, { status: string }>('review_payment'),
  revokeAccess: call<{ uid: string; playlistId: string; reason?: string }, { revoked: boolean }>('revoke_access'),
  reviewSubmission: call<
    { submissionId: string; status: 'APPROVED' | 'NEEDS_WORK'; text?: string; replyMediaId?: string },
    { status: string; celebrate: string[] }
  >('review_submission'),
};

export function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    const msg = err.message.replace(/^Firebase:\s*/, '').replace(/\s*\(.*\)\.?$/, '');
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is incorrect.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email.';
      case 'auth/weak-password':
        return 'Please choose a stronger password (at least 6 characters).';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'functions/unavailable':
      case 'unavailable':
        return 'You appear to be offline. Please try again.';
      default:
        return msg || 'Something went wrong.';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function errorDetails(err: unknown): Record<string, unknown> | undefined {
  const details = (err as { details?: unknown })?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
}
