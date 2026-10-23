/** Platform announcements: deliberately independent of any workspace. */
export const BROADCAST_LEVELS = ['info', 'warning', 'critical'] as const;
export type BroadcastLevel = (typeof BROADCAST_LEVELS)[number];

/** Public fields only; operator identities never leave the admin API. */
export interface ActiveBroadcastView {
  readonly id: string;
  readonly message: string;
  readonly level: BroadcastLevel;
  readonly startsAt: string;
  readonly expiresAt: string | null;
  readonly updatedAt: string;
}

export interface SystemBroadcastView extends ActiveBroadcastView {
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly archivedAt: string | null;
  readonly createdByName: string;
}

export interface SystemBroadcastPage {
  readonly items: readonly SystemBroadcastView[];
  readonly nextCursor: string | null;
}

export interface ActiveBroadcasts {
  readonly items: readonly ActiveBroadcastView[];
  /** Next start or expiry, including scheduled announcements currently outside the window. */
  readonly nextChangeAt: string | null;
  /** Clients schedule against this instant rather than their possibly inaccurate clock. */
  readonly serverNow: string;
}

export interface CreateBroadcastBody {
  readonly message: string;
  readonly level: BroadcastLevel;
  readonly startsAt?: string;
  readonly expiresAt?: string | null;
  readonly isActive?: boolean;
}

export interface UpdateBroadcastBody {
  readonly message?: string;
  readonly level?: BroadcastLevel;
  readonly startsAt?: string;
  readonly expiresAt?: string | null;
  readonly isActive?: boolean;
}

export interface SystemBroadcastEvent {
  readonly broadcastId: string;
  readonly action: 'published' | 'updated' | 'withdrawn';
}
