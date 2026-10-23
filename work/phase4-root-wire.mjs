import fs from 'node:fs';
import path from 'node:path';
const root = 'C:/Users/garus/OneDrive/Desktop/taskin';
function change(file, before, after) { const p=path.join(root,file); const s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'); if(!s.includes(before)) throw new Error('Missing anchor '+file); fs.writeFileSync(p,s.replace(before,after)); }
change('packages/contracts/src/api/index.ts', "export * from './platform-admin.js';", "export * from './platform-admin.js';\nexport * from './broadcasts.js';");
change('packages/contracts/src/realtime.ts', "import type { ManualPresence }", "import type { SystemBroadcastEvent } from './api/broadcasts.js';\nimport type { ManualPresence }");
change('packages/contracts/src/realtime.ts', 'export interface RealtimeEventMap {', "export interface RealtimeEventMap {\n  'system:broadcast': SystemBroadcastEvent;");
change('apps/api/src/platform/db/schema/index.ts', "export * from './platform-admin.js';", "export * from './platform-admin.js';\nexport * from './broadcasts.js';");
change('apps/api/src/platform/db/schema/enums.ts', 'PERMISSION_ACTION_IDS, PERMISSION_MODULE_IDS', 'BROADCAST_LEVELS, PERMISSION_ACTION_IDS, PERMISSION_MODULE_IDS');
change('apps/api/src/platform/db/schema/enums.ts', "export const userStatus", "export const broadcastLevel = pgEnum('broadcast_level', BROADCAST_LEVELS);\n\nexport const userStatus");
change('apps/api/src/platform/outbox/outbox-writer.ts', "import { Injectable }", "import type { SystemBroadcastEvent } from '@taskin/contracts';\nimport { Injectable }");
change('apps/api/src/platform/outbox/outbox-writer.ts', 'export interface OutboxEventMap {', "export interface OutboxEventMap {\n  'system.broadcast': SystemBroadcastEvent;");
change('apps/api/src/platform/realtime/rooms.ts', 'export const rooms = {', "export const rooms = {\n  /** Announcements received by every authenticated socket, across workspace switches. */\n  platform: 'platform',");
change('apps/api/src/platform/realtime/outbox-realtime.ts', "    case 'session.revoked': {", "    case 'system.broadcast': {\n      const data = payload as OutboxEventMap['system.broadcast'];\n      return [emit({ type: 'system:broadcast', workspaceId: null, rooms: [rooms.platform], data, durable: false })];\n    }\n    case 'session.revoked': {");
change('apps/api/src/modules/realtime/realtime.gateway.ts', 'await socket.join([rooms.user(socket.data.userId), rooms.session(socket.data.sessionId)]);', 'await socket.join([rooms.platform, rooms.user(socket.data.userId), rooms.session(socket.data.sessionId)]);');
fs.appendFileSync(path.join(root,'packages/contracts/src/api/platform-admin.ts'), `
/* ---------------------------------------------------------------- phase 4: platform operations */

export interface PlatformMetrics {
  readonly generatedAt: string;
  readonly cached: boolean;
  readonly users: { readonly total: number; readonly active: number; readonly suspended: number; readonly newLast7Days: number; readonly newLast30Days: number; readonly activeLast7Days: number };
  readonly workspaces: { readonly total: number; readonly active: number; readonly suspended: number; readonly deleted: number };
  readonly content: { readonly readyFiles: number; readonly storageUsedBytes: number; readonly tasks: number; readonly messages: number; readonly messagesLast7Days: number };
}

export interface PlatformProbe {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

export interface PlatformSmsProvider {
  readonly name: string;
  readonly failures: number;
  readonly openUntil: string | null;
}

export interface PlatformHealth {
  readonly checkedAt: string;
  readonly services: Readonly<Record<'database' | 'adminPool' | 'redisCore' | 'redisRt' | 'storage', PlatformProbe>>;
  readonly sms: { readonly providers: readonly PlatformSmsProvider[]; readonly failedJobs: number | null };
}

export interface PlatformQueueFailure {
  readonly name: string;
  readonly attempts: number;
  readonly failedAt: string | null;
  readonly reason: string;
}

export interface PlatformQueueHealth {
  readonly name: 'notifications' | 'work' | 'maintenance';
  readonly counts: Readonly<Record<'waiting' | 'active' | 'delayed' | 'failed' | 'paused', number>>;
  readonly recentFailures: readonly PlatformQueueFailure[];
  readonly error?: string;
}

export interface PlatformOutboxHealth {
  readonly checkedAt: string;
  readonly pending: { readonly count: number; readonly oldestAgeSeconds: number };
  readonly queues: readonly PlatformQueueHealth[];
}
`);
