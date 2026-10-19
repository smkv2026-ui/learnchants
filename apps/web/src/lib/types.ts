import type { Timestamp } from 'firebase/firestore';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type WithId<T> = T & { id: string };
export type TS = Timestamp | null | undefined;

export interface Playlist {
  title: string;
  titleNative?: string;
  description?: string;
  coverUrl?: string | null;
  access: 'free' | 'paid';
  price?: number | null;
  published: boolean;
  sequentialUnlock?: boolean;
  order?: number;
  verseCount?: number;
  createdAt?: TS;
  updatedAt?: TS;
}

export interface PaymentInfo {
  upiId: string;
  payeeName: string;
}

export interface NodeDoc {
  parentId: string | null;
  name: string;
  description?: string;
  order: number;
  verseCount?: number;
}

export interface Verse {
  nodeId: string;
  name: string;
  firstLine?: string;
  details?: string;
  order: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
  audioMediaId?: string;
  videoMediaId?: string;
  audioMime?: string;
  videoMime?: string;
  createdAt?: TS;
}

export interface Material {
  title: string;
  type: 'pdf' | 'scripture' | 'text';
  text?: string;
  nodeId?: string | null;
  mediaId?: string;
  mimeType?: string;
  sizeBytes?: number;
  status?: 'uploading' | 'ready';
  order?: number;
  createdAt?: TS;
}

export type SubmissionStatus = 'SUBMITTED' | 'NEEDS_WORK' | 'APPROVED';

export interface Submission {
  uid: string;
  userName?: string;
  pid: string;
  vid: string;
  nodeId?: string;
  playlistTitle?: string;
  verseName?: string;
  kind: 'audio' | 'video';
  mediaId: string;
  mimeType?: string;
  durationSec?: number | null;
  status: SubmissionStatus;
  replyCount?: number;
  createdAt?: TS;
  updatedAt?: TS;
}

export interface Reply {
  text?: string | null;
  mediaId?: string | null;
  kind?: 'audio' | 'video' | null;
  status: 'APPROVED' | 'NEEDS_WORK';
  authorLabel: string;
  createdAt?: TS;
}

export interface Progress {
  pid: string;
  uid: string;
  title?: string;
  approvedCount: number;
  totalCount: number;
  nodeApproved?: Record<string, number>;
  updatedAt?: TS;
  lastVerseId?: string;
}

export interface VerseStatus {
  status: SubmissionStatus;
  nodeId?: string;
  lastSubmissionId?: string;
  updatedAt?: TS;
}

export interface PaymentRequest {
  uid: string;
  userName?: string;
  pid: string;
  playlistTitle?: string;
  amount?: number;
  reference: string;
  screenshotMediaId?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  duplicateFlag?: boolean;
  createdAt?: TS;
}

export interface AppNotification {
  type: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt?: TS;
}

export interface AdminUser {
  email?: string;
  displayName?: string;
  role: Role;
  status: 'active' | 'deactivated';
  createdAt?: TS;
}

export interface AuditLog {
  actorUid: string;
  actorEmail?: string;
  action: string;
  target?: Record<string, unknown>;
  createdAt?: TS;
}
