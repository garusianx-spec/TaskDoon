import { pgEnum } from 'drizzle-orm/pg-core';
import { BROADCAST_LEVELS, PERMISSION_ACTION_IDS, PERMISSION_MODULE_IDS } from '@taskin/contracts';

/** Enum literals match `@taskin/contracts` exactly, so rows map to API types without translation. */

export const broadcastLevel = pgEnum('broadcast_level', BROADCAST_LEVELS);

export const userStatus = pgEnum('user_status', ['active', 'suspended', 'deleted']);

export const otpPurpose = pgEnum('otp_purpose', ['login', 'step_up', 'phone_change', 'password_reset']);

export const sessionRevokeReason = pgEnum('session_revoke_reason', [
  'logout',
  'user_revoked',
  'reuse_detected',
  'password_changed',
  'admin_action',
  'expired',
  'workspace_removed',
]);

export const memberStatus = pgEnum('member_status', ['active', 'suspended', 'left']);

/** `offline` is derived from socket connectivity and never stored. */
export const presenceStatus = pgEnum('presence_status', ['online', 'busy', 'away']);

export const avatarTone = pgEnum('avatar_tone', ['brand', 'teal', 'violet', 'amber', 'rose', 'slate']);

export const invitationChannel = pgEnum('invitation_channel', ['email', 'sms']);

export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'revoked', 'expired']);

export const permissionModule = pgEnum('permission_module', PERMISSION_MODULE_IDS);

export const permissionAction = pgEnum('permission_action', PERMISSION_ACTION_IDS);

/* ---------------------------------------------------------------- M2: work and content */

export const tagTone = pgEnum('tag_tone', ['gray', 'blue', 'teal', 'green', 'amber', 'red', 'pink', 'violet']);

export const projectRole = pgEnum('project_role', ['lead', 'contributor', 'viewer']);

export const projectVisibility = pgEnum('project_visibility', ['workspace', 'private']);

export const taskStatus = pgEnum('task_status', ['todo', 'in-progress', 'review', 'done']);

export const taskPriority = pgEnum('task_priority', ['urgent', 'high', 'medium', 'low']);

/* ---------------------------------------------------------------- Agile tracking */

export const issueType = pgEnum('issue_type', ['task', 'bug', 'feature']);

/** Set on bugs only (`tasks_severity_bug_only`). */
export const issueSeverity = pgEnum('issue_severity', ['critical', 'high', 'medium', 'low']);

/** `blocked_by` rows are the reverse edge of `blocks`; `relates_to` never blocks. */
export const taskDependencyType = pgEnum('task_dependency_type', ['blocks', 'blocked_by', 'relates_to']);

export const attachmentKind = pgEnum('attachment_kind', ['image', 'video', 'document', 'sheet', 'archive', 'audio']);

export const attachmentStatus = pgEnum('attachment_status', ['pending', 'scanning', 'ready', 'rejected', 'deleted']);

export const eventKind = pgEnum('event_kind', ['meeting', 'reminder', 'milestone']);

export const attendeeResponse = pgEnum('attendee_response', ['pending', 'accepted', 'declined', 'tentative']);

/** Hyphenated, as `NotificationKind` in the contracts (the RFC's convention: no mapping layer). */
export const notificationKind = pgEnum('notification_kind', [
  'task-assigned',
  'status-changed',
  'comment',
  'mention',
  'reply',
  'invitation',
  'event-reminder',
  'member-joined',
]);

export const activityKind = pgEnum('activity_kind', [
  'task-assigned',
  'task-completed',
  'task-commented',
  'message-mention',
  'file-shared',
  'member-joined',
]);

/* ---------------------------------------------------------------- M3: chat */

export const conversationKind = pgEnum('conversation_kind', ['direct', 'group', 'channel']);

export const conversationRole = pgEnum('conversation_role', ['owner', 'admin', 'member']);

export const postPolicy = pgEnum('post_policy', ['everyone', 'admins']);

/** `project_synced` channels follow their project's members (the M4 project↔channel link). */
export const membershipMode = pgEnum('membership_mode', ['manual', 'project_synced']);

export const notificationLevel = pgEnum('notification_level', ['all', 'mentions', 'none']);

export const messageKind = pgEnum('message_kind', ['text', 'voice', 'file', 'system']);

/* ---------------------------------------------------------------- Phase 3.2: scheduled messages */

export const scheduledMessageStatus = pgEnum('scheduled_message_status', ['pending', 'sent', 'cancelled', 'failed']);
