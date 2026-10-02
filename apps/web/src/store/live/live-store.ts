import type {
  AppNotification,
  AttachmentView,
  BoardColumn,
  ConversationDetail,
  ConversationView,
  MeUser,
  Message,
  MessageView,
  PermissionMatrix,
  RealtimeEnvelope,
  RealtimeEventMap,
  RealtimeEventType,
  RoleId,
  RoleView,
  SendMessageBody,
  TaskCard,
  TaskDetail,
  TaskDraft,
  WorkflowView,
} from '@taskin/contracts';
import { toISODate } from '@taskin/jalali';
import { api } from '@/api/endpoints';
import { ApiProblem, http, isProblem } from '@/api/http';
import { codeMessage, problemMessage } from '@/api/messages';
import {
  activityFromView,
  apiColumnFor,
  attachmentFromView,
  columnsFromWorkflows,
  conversationFromView,
  eventFromView,
  invitationFromView,
  meToUser,
  memberToUser,
  messageFromView,
  noteCategoryFromView,
  noteFromView,
  notificationFromView,
  projectFromView,
  scheduledFromView,
  trashedProjectFromView,
  workingHoursFromView,
  sessionFromView,
  taskFromCard,
  taskFromDetail,
  workspaceFromMe,
  workspaceFromView,
} from '@/api/mappers';
import { RealtimeClient, type ConnectionStatus } from '@/api/realtime';
import { blobFromDataUrl, postForm, uploadFile } from '@/api/uploads';
import { setFileResolver, type FileDisposition } from '../files';
import { session } from '@/api/session';
import { DEFAULT_PERMISSION_MATRIX, DEPARTMENTS } from '@/data/reference';
import { LIVE_EMPTY_STATE } from '../initial-state';
import { DEFAULT_WORKING_HOURS } from '@/lib/working-hours';
import type { ConversationDraft, PickedFile, TaskPatch, VoiceRecording, WorkspaceAction, WorkspaceState } from '../workspace-reducer';

export type LivePhase = 'restoring' | 'signed-out' | 'loading' | 'no-workspace' | 'ready';

export interface LiveToast {
  readonly id: number;
  readonly text: string;
}

export interface LiveStatus {
  readonly phase: LivePhase;
  readonly connection: ConnectionStatus;
  /** The signed-in account (also before it belongs to any workspace). */
  readonly user: MeUser | null;
  readonly toast: LiveToast | null;
}

type Apply = (action: WorkspaceAction) => void;
type Listener = (status: LiveStatus) => void;

const WORKSPACE_KEY = 'taskin.workspace';
/** An invitation link's token, kept across the sign-in screen until the account can accept it. */
const INVITE_KEY = 'taskin.invite';
/** How long a typing indicator lasts without a refresh (the server stops it after 6 s too). */
const TYPING_MS = 6_000;
/** Notes save this long after the last keystroke. */
const NOTE_SAVE_MS = 800;
const HISTORY_PAGE = 50;

const byPosition = (a: { readonly position: string }, b: { readonly position: string }) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

/**
 * The bridge between the reducer the screens were built on and the Taskin API (RFC §12, M4).
 *
 * - **Load**: after sign-in, one round of parallel requests fills the reducer (`sync/merge`).
 * - **Changes**: every action is applied to the reducer at once (optimistic), then sent here
 *   (`effect`), which calls the API and swaps in what the server answered — its ids, versions
 *   and placements. A refusal is shown and the affected entity is re-read from the server.
 * - **Realtime**: the socket's events (other people's changes) become `sync/*` actions. Events
 *   that arrive while the workspace is still loading wait, and are applied after it.
 */
export class LiveStore {
  private status: LiveStatus = { phase: 'restoring', connection: 'offline', user: null, toast: null };
  private readonly listeners = new Set<Listener>();
  private readonly realtime: RealtimeClient;
  private started = false;
  private workspaceId = '';
  private loadToken = 0;
  private toastId = 0;

  /** Server versions: tasks (`If-Match`, `expectedVersion`) and notes. */
  private readonly versions = new Map<string, number>();
  private readonly noteVersions = new Map<string, number>();
  /** A local (optimistic) id → the server id it becomes. */
  private readonly pending = new Map<string, Promise<string>>();
  /** Chat bookkeeping: each message's `seq`, each conversation's newest, and everyone's read cursor. */
  private readonly seqOf = new Map<string, number>();
  private readonly lastSeq = new Map<string, number>();
  private readonly readCursors = new Map<string, Map<string, number>>();
  private readonly historyLoaded = new Set<string>();
  private readonly detailLoaded = new Set<string>();
  private lastEventId: string | null = null;
  private buffered: RealtimeEnvelope[] | null = null;
  private departments = new Map<string, string>();
  private roleIds = new Map<RoleId, { readonly id: string; readonly version: number }>();
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly noteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private typingSentAt = new Map<string, number>();
  /** Signed file links, reused until shortly before they expire. */
  private readonly links = new Map<string, { readonly url: string; readonly expires: number }>();
  /**
   * Each task's subtask adds, one at a time: the API appends after the last key it reads, so
   * two adds in flight at once could take the same key and come back in either order.
   */
  private readonly subtaskAdds = new Map<string, Promise<void>>();
  /** Phase 3.2: schedules made here and not yet acknowledged, by client id → their local id. */
  private readonly scheduling = new Map<string, string>();
  /**
   * «ارسال فوری» in flight, by the schedule's client id → the local copy of its message. The
   * server broadcasts the message to this member's socket too; it replaces the copy in place.
   */
  private readonly sendingNow = new Map<string, string>();
  /** This member's messages that did not reach the server: how to send each again, or let it go. */
  private readonly unsent = new Map<string, { readonly retry: () => void; readonly discard: () => void }>();

  private getState: () => WorkspaceState = () => LIVE_EMPTY_STATE;
  private apply: Apply = () => undefined;

  constructor() {
    this.realtime = new RealtimeClient({
      token: () => session.current?.accessToken ?? null,
      onEvent: (envelope) => this.receive(envelope),
      onStatus: (connection) => this.patch({ connection }),
      resumeFrom: () => ({ workspaceId: this.workspaceId, conversations: Object.fromEntries(this.lastSeq), lastEventId: this.lastEventId }),
      onResumed: (result) => {
        for (const [conversationId, resumed] of Object.entries(result.conversations)) {
          if ('gap' in resumed) {
            this.historyLoaded.delete(conversationId);
            void this.ensureHistory(conversationId);
          } else {
            for (const view of resumed.messages) this.receiveMessage(view);
          }
        }
      },
      onRejected: () => this.ended(),
      refreshToken: async () => (await session.restore()) !== null,
    });
    setFileResolver((attachmentId, disposition) => this.fileLink(attachmentId, disposition));
    session.subscribe((current) => {
      if (current) this.realtime.refreshToken(current.accessToken);
      else if (this.status.phase === 'ready' || this.status.phase === 'loading' || this.status.phase === 'no-workspace') this.ended();
    });
  }

  /** Connects the store to the provider's state (called again whenever the provider remounts). */
  attach(getState: () => WorkspaceState, apply: Apply): void {
    this.getState = getState;
    this.apply = apply;
  }

  /* ================================================================ status */

  get current(): LiveStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private patch(change: Partial<LiveStatus>): void {
    this.status = { ...this.status, ...change };
    for (const listener of this.listeners) listener(this.status);
  }

  notify(text: string): void {
    this.toastId += 1;
    this.patch({ toast: { id: this.toastId, text } });
  }

  dismissToast(id: number): void {
    if (this.status.toast?.id === id) this.patch({ toast: null });
  }

  /* ================================================================ session */

  /** Once per page: turns the refresh cookie into a session, or shows the sign-in screen. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    captureInvite();
    const restored = await session.restore();
    if (!restored) {
      this.patch({ phase: 'signed-out', user: null });
      return;
    }
    await this.load();
  }

  /** An invitation link is waiting for the account to sign in. */
  get invited(): boolean {
    return peekInvite() !== null;
  }

  /** After the sign-in screen: the session exists, load the account's workspace. */
  async signedIn(): Promise<void> {
    await this.load();
  }

  /** The first workspace of a new account. Owners need an admin password first. */
  async createFirstWorkspace(name: string, password: string | null): Promise<void> {
    if (password) await session.setPassword(password);
    const created = await api.workspaces.create({ name });
    await this.load(created.id);
  }

  async signOut(): Promise<void> {
    await session.signOut();
    this.ended();
  }

  /** The session is over (signed out here or elsewhere, revoked, expired). */
  private ended(): void {
    this.loadToken += 1;
    this.realtime.disconnect();
    this.reset();
    this.apply({ type: 'sync/merge', patch: { ...LIVE_EMPTY_STATE, session: 'signed-out' } });
    this.patch({ phase: 'signed-out', user: null, connection: 'offline' });
  }

  private reset(): void {
    this.workspaceId = '';
    this.versions.clear();
    this.noteVersions.clear();
    this.pending.clear();
    this.seqOf.clear();
    this.lastSeq.clear();
    this.readCursors.clear();
    this.historyLoaded.clear();
    this.detailLoaded.clear();
    this.lastEventId = null;
    this.buffered = null;
    this.links.clear();
    for (const entry of this.unsent.values()) entry.discard();
    this.unsent.clear();
    for (const timer of this.typingTimers.values()) clearTimeout(timer);
    this.typingTimers.clear();
  }

  /* ================================================================ load */

  /**
   * Fills the reducer with one workspace: the preferred one, the last one used on this device, or
   * the first. `quiet` refreshes in place (after `resync:required`) without the loading screen.
   */
  async load(preferredId?: string, quiet = false): Promise<void> {
    const token = ++this.loadToken;
    if (!quiet) this.patch({ phase: 'loading' });
    try {
      const joined = await this.acceptPendingInvite();
      if (token !== this.loadToken) return;
      const preferred = joined ?? preferredId;
      const me = await api.me.get();
      if (token !== this.loadToken) return;
      session.updateUser(me.user);
      this.patch({ user: me.user });
      // Workspaces the platform's administrators suspended are listed (and marked) but never opened.
      const usable = me.workspaces.filter((entry) => !entry.suspended);
      if (usable.length < me.workspaces.length && (usable.length === 0 || me.workspaces.some((entry) => entry.suspended && entry.id === preferred))) {
        this.notify(codeMessage('WORKSPACE_SUSPENDED') ?? 'این فضای کاری معلق شده است.');
      }
      if (usable.length === 0) {
        this.realtime.disconnect();
        this.apply({ type: 'sync/merge', patch: { ...LIVE_EMPTY_STATE, meId: me.user.id, users: [meToUser(me.user)] } });
        this.patch({ phase: 'no-workspace' });
        return;
      }
      const remembered = readRemembered();
      const target = usable.find((entry) => entry.id === preferred) ?? usable.find((entry) => entry.id === remembered) ?? usable[0];
      if (!target) return;
      if (target.id !== this.workspaceId) this.reset();
      this.workspaceId = target.id;
      // Subscribe before reading, so nothing that happens meanwhile is missed; it waits in a buffer.
      this.buffered = [];
      this.realtime.connect(target.id);

      const w = target.id;
      const today = new Date();
      const from = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 45));
      const to = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 54));
      const [view, members, departments, projects, workflow, cards, conversations, inbox, activity, calendar, invitations, roles, categories, notes, sessions, scheduled, hours] = await Promise.all([
        api.workspaces.get(w),
        api.workspaces.members(w, true),
        optional(http.get<Array<{ readonly id: string; readonly name: string }>>(`/workspaces/${w}/departments`), []),
        api.projects.list(w),
        api.workflow.list(w),
        api.tasks.all(w),
        optional(api.conversations.list(w), []),
        optional(api.me.notifications({ workspaceId: w, limit: 100 }), { items: [], nextCursor: null, unreadCount: 0 }),
        optional(api.activity(w), { items: [], nextCursor: null }),
        optional(api.calendar.range(w, from, to), null),
        optional(api.workspaces.invitations(w), []),
        optional(api.workspaces.roles(w), []),
        optional(api.notes.categories(w), []),
        optional(api.notes.all(w), []),
        optional(api.sessions.list(), []),
        optional(api.scheduled.list(w), []),
        optional(api.workingHours.get(w), null),
      ]);
      if (token !== this.loadToken) return;

      this.departments = new Map(departments.map((department) => [department.id, department.name]));
      const departmentName = (id: string | null) => (id ? this.departments.get(id) : undefined);
      const users = members.filter((member) => member.status === 'active').map((member) => memberToUser(member, departmentName));
      // Removed members are still named on what they left behind (as former members).
      const formerUsers = members.filter((member) => member.status === 'left').map((member) => memberToUser(member, departmentName));
      const nameOf = (userId: string) => [...users, ...formerUsers].find((user) => user.id === userId)?.fullName;
      const columns = columnsFromWorkflows(workflow);
      const columnOrder = new Map(workflow.flatMap((view) => view.columns.map((column) => [column.id, column.position] as const)));
      const orderedCards = [...cards].sort((a, b) => {
        const byColumn = (columnOrder.get(a.columnId) ?? '').localeCompare(columnOrder.get(b.columnId) ?? '');
        return byColumn !== 0 ? byColumn : byPosition(a, b);
      });
      const previous = new Map(this.getState().tasks.map((task) => [task.id, task]));
      for (const card of cards) this.versions.set(card.id, card.version);
      for (const note of notes) this.noteVersions.set(note.id, note.version);
      const mine = members.find((member) => member.userId === me.user.id);
      const conversationList = conversations.map((entry) => conversationFromView(entry, me.user.id, nameOf));
      for (const entry of conversations) this.lastSeq.set(entry.id, Math.max(this.lastSeq.get(entry.id) ?? 0, entry.lastSeq));
      const state = this.getState();
      const keepConversation = conversationList.some((entry) => entry.id === state.activeConversationId);
      this.roleIds = new Map(roles.map((role) => [role.key, { id: role.id, version: role.version }]));

      this.apply({
        type: 'sync/merge',
        patch: {
          session: 'active',
          meId: me.user.id,
          users: users.length > 0 ? users : [meToUser(me.user)],
          formerUsers,
          // Read from the server when «آرشیو / سطل زباله» opens.
          projectTrash: [],
          projects: projects.filter((project) => !project.archived).map((project) => projectFromView(project, departmentName)),
          workspaces: me.workspaces.map((entry) => (entry.id === w ? workspaceFromView(view) : workspaceFromMe(entry, me.user.id))),
          activeWorkspaceId: w,
          parkedWorkspaces: {},
          boardColumns: columns,
          tasks: orderedCards.map((card) => taskFromCard(card, columns, previous.get(card.id))),
          archivedTasks: [],
          conversations: conversationList,
          messages: [
            ...conversations.flatMap((entry) => (entry.lastMessage ? [previewMessage(entry, nameOf)] : [])),
            // Unsent messages of this member's stay, with their «ارسال دوباره», through a re-read.
            ...state.messages.filter((message) => message.failed && conversations.some((entry) => entry.id === message.conversationId)),
          ],
          unreadByConversation: Object.fromEntries(conversations.map((entry) => [entry.id, entry.unreadCount])),
          pinnedConversationIds: conversationList.filter((entry) => entry.pinned).map((entry) => entry.id),
          mutedConversationIds: conversationList.filter((entry) => entry.muted).map((entry) => entry.id),
          activeConversationId: keepConversation ? state.activeConversationId : (conversationList[0]?.id ?? ''),
          notifications: inbox.items.map(notificationFromView).filter((item): item is AppNotification => item !== null),
          activity: activity.items.map(activityFromView),
          calendarEvents: calendar ? calendar.events.map(eventFromView) : [],
          invitations: invitations.filter((entry) => entry.status === 'pending').map((entry) => invitationFromView(entry, departmentName)),
          permissions: roles.length > 0 ? matrixFrom(roles) : DEFAULT_PERMISSION_MATRIX,
          noteCategories: [...categories].sort((a, b) => a.position - b.position).map(noteCategoryFromView),
          notes: notes.map(noteFromView),
          loginSessions: sessions.map(sessionFromView),
          scheduledMessages: scheduled.map(scheduledFromView),
          workingHours: hours ? workingHoursFromView(hours) : DEFAULT_WORKING_HOURS,
          profile: { presence: mine?.presence ?? 'online', statusMessage: mine?.statusMessage ?? '' },
          typingByConversation: {},
          inspector: quiet ? state.inspector : { kind: 'none' },
        },
      });
      rememberWorkspace(w);
      this.historyLoaded.clear();
      this.detailLoaded.clear();
      this.patch({ phase: 'ready' });

      const waiting = this.buffered ?? [];
      this.buffered = null;
      for (const envelope of waiting) this.receive(envelope);
      const active = this.getState().activeConversationId;
      if (active) void this.ensureHistory(active);
      const inspected = this.getState().inspector;
      if (inspected.kind === 'task') void this.ensureDetail(inspected.taskId);
    } catch (error) {
      if (token !== this.loadToken) return;
      if (isProblem(error, 'UNAUTHENTICATED') || isProblem(error, 'SESSION_REVOKED')) {
        this.ended();
        return;
      }
      this.buffered = null;
      this.notify(problemMessage(error, 'بارگذاری فضای کاری ممکن نشد.'));
      if (!quiet) this.patch({ phase: this.getState().workspaces.length > 0 ? 'ready' : 'signed-out' });
    }
  }

  /** Joins the workspace of an invitation link opened on this tab, once there is an account to join with. */
  private async acceptPendingInvite(): Promise<string | null> {
    const invite = takeInvite();
    if (!invite) return null;
    try {
      const joined = await api.workspaces.acceptInvitation(invite);
      return joined.workspaceId;
    } catch (error) {
      if (isProblem(error, 'UNAUTHENTICATED') || isProblem(error, 'SESSION_REVOKED')) {
        keepInvite(invite);
        throw error;
      }
      this.notify(problemMessage(error, 'پذیرفتن دعوت‌نامه ممکن نشد.'));
      return null;
    }
  }

  /* ================================================================ reads on demand */

  /** A task's description, subtasks, comments and files, the first time it is opened. */
  async ensureDetail(taskId: string): Promise<void> {
    if (this.detailLoaded.has(taskId) || isLocal(taskId)) return;
    this.detailLoaded.add(taskId);
    const known = this.getState().tasks.some((task) => task.id === taskId);
    try {
      this.upsertDetail(await api.tasks.get(this.workspaceId, taskId));
    } catch (error) {
      this.detailLoaded.delete(taskId);
      if (isProblem(error, 'NOT_FOUND')) this.apply({ type: 'sync/remove-task', taskId });
      // A chat chip can name a task of a project this member cannot see.
      if (!known && (isProblem(error, 'NOT_FOUND') || isProblem(error, 'FORBIDDEN'))) {
        this.apply({ type: 'close-inspector' });
        this.notify('این وظیفه در پروژه‌ای است که به آن دسترسی ندارید.');
      }
    }
  }

  /** The latest page of a conversation, and its members' read cursors, the first time it is opened. */
  async ensureHistory(conversationId: string): Promise<void> {
    if (this.historyLoaded.has(conversationId) || isLocal(conversationId)) return;
    this.historyLoaded.add(conversationId);
    try {
      const [page, detail] = await Promise.all([
        api.conversations.messages(this.workspaceId, conversationId, { limit: HISTORY_PAGE }),
        api.conversations.get(this.workspaceId, conversationId),
      ]);
      this.cursorsFrom(detail);
      const messages = page.items.map((view) => this.messageFrom(view));
      this.apply({ type: 'sync/upsert-messages', messages });
      this.markRead(conversationId);
    } catch (error) {
      this.historyLoaded.delete(conversationId);
      this.fail(error);
    }
  }

  /**
   * Everything shared in a conversation, as the server lists it (the whole history, not only the
   * loaded page): files, media, voice notes and links, as messages the shared-media drawer sorts.
   */
  async sharedMedia(conversationId: string): Promise<Message[]> {
    if (isLocal(conversationId)) return [];
    const tabs = ['files', 'media', 'audio', 'links'] as const;
    const pages = await Promise.all(tabs.map((tab) => api.conversations.media(this.workspaceId, conversationId, tab)));
    const messages: Message[] = [];
    pages.forEach((page, index) => {
      const tab = tabs[index];
      page.items.forEach((item, position) => {
        const base = { conversationId, authorId: item.authorId ?? '', sentAt: item.createdAt, replyToId: null, reactions: [], edited: false, linkedTaskId: null, readByIds: [] };
        if (tab === 'links') {
          if (item.url) messages.push({ ...base, id: `${item.messageId}~link~${position}`, body: { kind: 'text', text: item.url } });
        } else if (tab === 'audio' && item.durationSec !== null) {
          messages.push({ ...base, id: item.messageId, body: { kind: 'voice', durationSec: item.durationSec, waveform: [], src: null, ...(item.attachment ? { attachmentId: item.attachment.id } : {}) } });
        } else if (item.attachment) {
          messages.push({ ...base, id: item.messageId, body: { kind: 'file', attachment: attachmentFromView(item.attachment), caption: null } });
        }
      });
    });
    return messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }

  /* ================================================================ changes */

  /** Sends one reducer action's change to the API. `prev` and `next` are the states around it. */
  effect(action: WorkspaceAction, prev: WorkspaceState, next: WorkspaceState): void {
    if (this.status.phase !== 'ready') return;
    switch (action.type) {
      case 'select-conversation':
        void this.ensureHistory(action.conversationId);
        this.markRead(action.conversationId);
        return;
      case 'open-task':
        void this.ensureDetail(action.taskId);
        return;
      case 'move-task':
      case 'move-task-to-column':
        void this.place(action.taskId, next);
        return;
      case 'set-task-completed':
        void this.complete(action.taskId, action.completed, prev);
        return;
      case 'add-board-column':
        void this.addColumn(prev, next, action.title, action.tone);
        return;
      case 'rename-board-column':
        this.run(() => api.workflow.updateColumn(this.workspaceId, action.columnId, { title: action.title.trim() }).then((view) => this.applyWorkflow(view)), () => this.refreshWorkflow());
        return;
      case 'remove-board-column':
        this.run(
          async () => {
            await api.workflow.removeColumn(this.workspaceId, action.columnId, action.disposition);
            await this.refreshWorkflow(true);
          },
          () => this.refreshWorkflow(true),
        );
        return;
      case 'patch-task':
        void this.patchTask(action.taskId, action.patch);
        return;
      case 'toggle-task-star': {
        const starred = next.tasks.find((task) => task.id === action.taskId)?.starred ?? false;
        this.run(async () => api.tasks.star(this.workspaceId, await this.serverId(action.taskId), starred), () => this.refreshTask(action.taskId));
        return;
      }
      case 'toggle-subtask': {
        const done = next.tasks.find((task) => task.id === action.taskId)?.subtasks.find((subtask) => subtask.id === action.subtaskId)?.done ?? false;
        this.run(async () => {
          await api.tasks.updateSubtask(this.workspaceId, await this.serverId(action.taskId), action.subtaskId, { done });
          await this.refreshTask(action.taskId);
        }, () => this.refreshTask(action.taskId));
        return;
      }
      case 'add-subtask': {
        const added = (this.subtaskAdds.get(action.taskId) ?? Promise.resolve()).then(async () => {
          await api.tasks.addSubtask(this.workspaceId, await this.serverId(action.taskId), action.title);
          await this.refreshTask(action.taskId);
        });
        const settled = added.catch(() => undefined);
        this.subtaskAdds.set(action.taskId, settled);
        void settled.then(() => {
          if (this.subtaskAdds.get(action.taskId) === settled) this.subtaskAdds.delete(action.taskId);
        });
        this.run(() => added, () => this.refreshTask(action.taskId));
        return;
      }
      case 'remove-subtask':
        this.run(async () => {
          await api.tasks.removeSubtask(this.workspaceId, await this.serverId(action.taskId), action.subtaskId);
          await this.refreshTask(action.taskId);
        }, () => this.refreshTask(action.taskId));
        return;
      case 'add-task-comment':
        this.run(async () => {
          await api.tasks.comment(this.workspaceId, await this.serverId(action.taskId), action.body, action.replyToId);
          await this.refreshTask(action.taskId);
        }, () => this.refreshTask(action.taskId));
        return;
      case 'create-task':
        this.createTask(action.draft, prev, next);
        return;
      case 'move-subtask':
        void this.moveSubtask(action.taskId, action.subtaskId, next);
        return;
      case 'attach-task-files':
        this.attachFiles(action.taskId, action.files);
        return;
      case 'remove-task-attachment':
        this.run(async () => {
          await api.tasks.detach(this.workspaceId, await this.serverId(action.taskId), action.attachmentId);
        }, () => this.refreshTask(action.taskId));
        return;
      case 'send-file':
        this.sendFile(action.conversationId, action.messageId, action.picked, action.caption, action.replyToId, action.asFile ?? false, next);
        return;
      case 'resend-message':
        this.unsent.get(action.messageId)?.retry();
        return;
      case 'discard-message':
        this.unsent.get(action.messageId)?.discard();
        this.unsent.delete(action.messageId);
        return;
      case 'send-voice':
        this.sendVoice(action.conversationId, action.messageId, action.recording, next);
        return;
      case 'focus-message':
        void this.ensureHistory(action.conversationId);
        this.markRead(action.conversationId);
        return;
      case 'create-project':
        if (!next.projects.some((project) => project.id === action.projectId)) return;
        this.track(action.projectId, async () => {
          const departmentName = DEPARTMENTS.find((department) => department.id === action.draft.departmentId)?.name;
          const departmentId = [...this.departments].find(([, name]) => name === departmentName)?.[0];
          const created = await api.projects.create(this.workspaceId, {
            key: action.draft.key,
            name: action.draft.name.trim(),
            description: action.draft.description.trim(),
            color: action.draft.color,
            ...(departmentId ? { departmentId } : {}),
          });
          this.apply({ type: 'sync/upsert-project', project: projectFromView(created, (id) => (id ? this.departments.get(id) : undefined)), replaceId: action.projectId });
          // The server gave the project its own four columns: they replace the local stand-ins.
          await this.refreshWorkflow();
          return created.id;
        });
        return;
      case 'create-conversation':
        this.createConversation(action.draft, prev, next);
        return;
      case 'delete-project':
        this.run(async () => {
          await api.projects.remove(this.workspaceId, await this.serverId(action.projectId));
          // Its channel went with it: the server archived it.
          await this.refreshProjectTrash();
        }, () => this.load(this.workspaceId, true));
        return;
      case 'restore-project':
        this.run(async () => {
          await api.projects.restore(this.workspaceId, action.projectId);
          // Its tasks, board and channel come back from the server.
          await this.load(this.workspaceId, true);
        }, () => this.load(this.workspaceId, true));
        return;
      case 'load-project-trash':
        void this.refreshProjectTrash();
        return;
      case 'remove-member':
        this.run(async () => {
          // Removing someone is a step-up action: the admin password confirms it.
          if (action.password) await session.stepUp(action.password);
          await api.workspaces.removeMember(this.workspaceId, action.userId);
        }, () => this.load(this.workspaceId, true));
        return;
      case 'send-message':
        this.sendMessage(action.conversationId, action.text, action.replyToId, prev, next);
        return;
      case 'schedule-message': {
        const clientMsgId = crypto.randomUUID();
        this.scheduling.set(clientMsgId, action.scheduledId);
        this.track(
          action.scheduledId,
          async () => {
            const view = await api.scheduled.create(this.workspaceId, await this.serverId(action.conversationId), {
              clientMsgId,
              kind: 'text',
              text: action.text,
              scheduledAt: action.scheduledAt,
              ...(action.replyToId ? { replyToId: await this.serverId(action.replyToId) } : {}),
            });
            this.scheduling.delete(clientMsgId);
            this.apply({ type: 'sync/upsert-scheduled', scheduled: scheduledFromView(view), replaceId: action.scheduledId });
            return view.id;
          },
          () => {
            this.scheduling.delete(clientMsgId);
            this.apply({ type: 'sync/remove-scheduled', scheduledId: action.scheduledId });
          },
        );
        return;
      }
      case 'cancel-scheduled-message':
        this.run(async () => api.scheduled.cancel(this.workspaceId, await this.serverId(action.scheduledId)), () => this.refreshScheduled());
        return;
      case 'send-scheduled-now': {
        const scheduled = prev.scheduledMessages.find((entry) => entry.id === action.scheduledId);
        const clientMsgId = scheduled?.clientMsgId ?? [...this.scheduling].find(([, localId]) => localId === action.scheduledId)?.[0];
        if (clientMsgId) this.sendingNow.set(clientMsgId, action.messageId);
        this.run(
          async () => {
            const view = await api.scheduled.sendNow(this.workspaceId, await this.serverId(action.scheduledId));
            // The stored message replaces the local copy; its message:new may have come first.
            const state = this.getState();
            const local = state.messages.find((message) => message.id === action.messageId);
            if (!view.messageId || !local) return;
            if (state.messages.some((message) => message.id === view.messageId)) this.apply({ type: 'sync/remove-message', messageId: action.messageId });
            else this.apply({ type: 'sync/upsert-messages', messages: [{ ...local, id: view.messageId }], replaceId: action.messageId });
          },
          async () => {
            if (clientMsgId) this.sendingNow.delete(clientMsgId);
            this.apply({ type: 'sync/remove-message', messageId: action.messageId });
            await this.refreshScheduled();
          },
        );
        return;
      }
      case 'update-working-hours':
        this.run(async () => {
          const view = await api.workingHours.put(this.workspaceId, action.hours);
          this.apply({ type: 'sync/merge', patch: { workingHours: workingHoursFromView(view) } });
        }, () => this.refreshWorkingHours());
        return;
      case 'toggle-reaction':
        void this.react(action.messageId, action.emoji, next);
        return;
      case 'mark-conversation-read':
        this.markRead(action.conversationId);
        return;
      case 'toggle-conversation-pin':
        this.run(async () => {
          const conversationId = await this.serverId(action.conversationId);
          await api.conversations.updateMine(this.workspaceId, conversationId, { pinned: next.pinnedConversationIds.includes(action.conversationId) });
        }, () => this.load(this.workspaceId, true));
        return;
      case 'toggle-conversation-mute':
        this.run(async () => {
          const conversationId = await this.serverId(action.conversationId);
          const muted = next.mutedConversationIds.includes(action.conversationId);
          await api.conversations.updateMine(this.workspaceId, conversationId, { mutedUntil: muted ? new Date(Date.now() + 10 * 365 * 86_400_000).toISOString() : null });
        }, () => this.load(this.workspaceId, true));
        return;
      case 'create-calendar-event': {
        const local = next.calendarEvents.find((event) => !prev.calendarEvents.some((entry) => entry.id === event.id));
        if (!local) return;
        this.run(async () => {
          const created = await api.calendar.create(this.workspaceId, { ...action.draft, projectId: action.draft.projectId, attendeeIds: action.draft.attendeeIds });
          this.apply({ type: 'sync/upsert-event', event: eventFromView(created), replaceId: local.id });
        }, () => this.load(this.workspaceId, true));
        return;
      }
      case 'create-note':
        // A blank note stays on this page: it reaches the server with its first words (`update-note`).
        return;
      case 'update-note':
        if (this.isNoteDraft(action.noteId)) this.createNote(action.noteId);
        else this.saveNote(action.noteId);
        return;
      case 'delete-note':
      case 'discard-note':
        clearTimeout(this.noteTimers.get(action.noteId));
        this.noteTimers.delete(action.noteId);
        // A draft never stored has nothing to delete on the server.
        if (this.isNoteDraft(action.noteId)) return;
        this.run(async () => api.notes.remove(this.workspaceId, await this.serverId(action.noteId)), () => this.load(this.workspaceId, true));
        return;
      case 'create-note-category':
        if (!next.noteCategories.some((category) => category.id === action.categoryId)) return;
        this.track(action.categoryId, async () => {
          const created = await api.notes.createCategory(this.workspaceId, action.label.trim());
          this.apply({ type: 'sync/upsert-note-category', category: noteCategoryFromView(created), replaceId: action.categoryId });
          return created.id;
        });
        return;
      case 'delete-note-category':
        if (next.noteCategories.some((category) => category.id === action.categoryId)) return;
        this.run(async () => {
          await api.notes.removeCategory(this.workspaceId, await this.serverId(action.categoryId));
          // Its notes were filed in no notebook, each with a new version: autosave needs them.
          for (const note of await api.notes.all(this.workspaceId)) this.noteVersions.set(note.id, note.version);
        }, () => this.load(this.workspaceId, true));
        return;
      case 'mark-notification-read':
        if (prev.notifications.find((notification) => notification.id === action.notificationId)?.read) return;
        this.run(() => api.me.markNotificationsRead({ ids: [action.notificationId] }));
        return;
      case 'mark-all-notifications-read':
        this.run(() => api.me.markNotificationsRead({ all: true, workspaceId: this.workspaceId }));
        return;
      case 'invite-members': {
        const created = next.invitations.filter((invitation) => !prev.invitations.some((entry) => entry.id === invitation.id));
        if (created.length === 0) return;
        this.run(async () => {
          const result = await api.workspaces.invite(this.workspaceId, {
            recipients: created.map(({ address, channel }) => ({ address, channel })),
            role: action.draft.role,
            message: action.draft.message,
          });
          if (result.rejected.length > 0) this.notify(`${result.rejected.length} دعوت‌نامه ارسال نشد (عضو فعلی، دعوت تکراری یا نشانی نامعتبر).`);
          const departmentName = (id: string | null) => (id ? this.departments.get(id) : undefined);
          const pending = await api.workspaces.invitations(this.workspaceId);
          this.apply({ type: 'sync/merge', patch: { invitations: pending.filter((entry) => entry.status === 'pending').map((entry) => invitationFromView(entry, departmentName)) } });
        }, () => this.load(this.workspaceId, true));
        return;
      }
      case 'revoke-invitation':
        this.run(async () => api.workspaces.revokeInvitation(this.workspaceId, await this.serverId(action.invitationId)), () => this.load(this.workspaceId, true));
        return;
      case 'update-profile': {
        const { presence, statusMessage } = action.profile;
        // «نامرئی» is not a state the server stores: connectivity decides offline.
        const manual = presence === 'offline' ? 'away' : presence;
        this.run(() => api.workspaces.setPresence(this.workspaceId, manual, statusMessage));
        return;
      }
      case 'revoke-login-session':
        this.run(() => api.sessions.revoke(action.sessionId), () => this.refreshSessions());
        return;
      case 'revoke-other-login-sessions':
        this.run(() => api.sessions.revokeOthers(), () => this.refreshSessions());
        return;
      case 'switch-workspace':
        if (this.getState().workspaces.find((entry) => entry.id === action.workspaceId)?.suspended) {
          this.notify(codeMessage('WORKSPACE_SUSPENDED') ?? 'این فضای کاری معلق شده است.');
          return;
        }
        void this.load(action.workspaceId);
        return;
      case 'create-workspace':
        this.run(async () => {
          if (action.adminPassword) await session.setPassword(action.adminPassword);
          const iconUploadKey = action.draft.iconUrl ? await this.uploadIcon(action.draft.iconUrl) : undefined;
          const created = await api.workspaces.create({
            name: action.draft.name.trim(),
            description: action.draft.description.trim(),
            tone: action.draft.tone,
            ...(iconUploadKey ? { iconUploadKey } : {}),
          });
          await this.load(created.id);
        }, () => this.load(prev.activeWorkspaceId));
        return;
      case 'delete-workspace': {
        const workspace = prev.workspaces.find((entry) => entry.id === action.workspaceId);
        if (!workspace || next.workspaces.length === prev.workspaces.length) return;
        this.run(async () => {
          if (action.password) await session.stepUp(action.password);
          await api.workspaces.remove(workspace.id, workspace.name);
          await this.load();
        }, () => this.load(prev.activeWorkspaceId));
        return;
      }
      case 'sign-out':
        void this.signOut();
        return;
      case 'set-permission':
      case 'set-module-permissions':
      case 'set-action-permissions':
      case 'set-role-permissions':
        void this.saveRole(action.role, next.permissions);
        return;
      case 'replace-permissions':
        this.run(async () => {
          await http.post(`/workspaces/${this.workspaceId}/roles/reset-defaults`);
          await this.refreshRoles();
        }, () => this.refreshRoles());
        return;
      default:
        return;
    }
  }

  /** Sets or changes the admin password. The server signs the other sessions out; the list follows. */
  async changePassword(current: string | null, next: string): Promise<string | null> {
    try {
      await session.setPassword(next, current ?? undefined);
      this.patch({ user: session.current?.user ?? this.status.user });
      await this.refreshSessions();
      return null;
    } catch (error) {
      if (isProblem(error, 'UNAUTHENTICATED') || isProblem(error, 'SESSION_REVOKED')) session.end();
      if (isProblem(error, 'STEP_UP_REQUIRED')) return 'برای تعیین رمز، یک بار از حساب خارج و دوباره وارد شوید.';
      return problemMessage(error, 'تغییر رمز ممکن نشد.');
    }
  }

  /** The composer is typing: at most one `typing:start` every three seconds. */
  typing(conversationId: string, active: boolean): void {
    if (this.status.phase !== 'ready' || isLocal(conversationId)) return;
    const last = this.typingSentAt.get(conversationId) ?? 0;
    if (active && Date.now() - last < 3_000) return;
    this.typingSentAt.set(conversationId, active ? Date.now() : 0);
    this.realtime.typing(conversationId, active);
  }

  /* ---------------------------------------------------------------- tasks */

  private createTask(draft: TaskDraft, prev: WorkspaceState, next: WorkspaceState): void {
    const local = next.tasks.find((task) => !prev.tasks.some((entry) => entry.id === task.id));
    if (!local) return;
    this.track(local.id, async () => {
      const column = apiColumnFor(serverColumnsOf(this.getState(), local.projectId), { status: local.status, boardColumnId: local.boardColumnId });
      let detail: TaskDetail;
      const source = draft.sourceMessageId ? this.getState().messages.find((message) => message.id === draft.sourceMessageId) : undefined;
      if (draft.sourceMessageId && source) {
        // «تبدیل پیام به وظیفه»: the server links the task to the message (and the message's file).
        const converted = await api.conversations.convert(this.workspaceId, await this.serverId(source.conversationId), await this.serverId(draft.sourceMessageId), {
          projectId: await this.serverId(draft.projectId),
          title: draft.title,
          description: draft.description,
          columnId: column?.id ?? null,
          priority: draft.priority,
          assigneeIds: draft.assigneeIds,
          dueDate: draft.dueDate,
          subtasks: draft.subtaskTitles,
          attachmentIds: draft.attachments.filter((attachment) => !isLocal(attachment.id)).map((attachment) => attachment.id),
        });
        if (converted.existing) this.notify(`این پیام پیش‌تر به وظیفه ${converted.task.code} تبدیل شده بود؛ همان وظیفه باز شد.`);
        detail = converted.task;
      } else if (draft.sourceNoteId) {
        const converted = await api.notes.convert(this.workspaceId, await this.serverId(draft.sourceNoteId), {
          projectId: await this.serverId(draft.projectId),
          columnId: column?.id ?? null,
          priority: draft.priority,
          assigneeIds: draft.assigneeIds,
          dueDate: draft.dueDate,
        });
        detail = converted.task;
      } else {
        detail = await api.tasks.create(this.workspaceId, {
          projectId: await this.serverId(draft.projectId),
          title: draft.title,
          description: draft.description,
          columnId: column?.id ?? null,
          priority: draft.priority,
          assigneeIds: draft.assigneeIds,
          dueDate: draft.dueDate,
          subtasks: draft.subtaskTitles,
        });
      }
      this.detailLoaded.add(detail.id);
      this.upsertDetail(detail, local.id);
      return detail.id;
    });
  }

  private async place(taskId: string, next: WorkspaceState): Promise<void> {
    const task = next.tasks.find((entry) => entry.id === taskId);
    if (!task) return;
    const column = apiColumnFor(serverColumnsOf(next, task.projectId), { status: task.status, boardColumnId: task.boardColumnId });
    if (!column) return;
    await this.attempt(taskId, async (id, version) => {
      const card = await api.tasks.move(this.workspaceId, id, { columnId: column.id, expectedVersion: version });
      this.upsertCard(card);
    });
  }

  private async complete(taskId: string, completed: boolean, prev: WorkspaceState): Promise<void> {
    if ((prev.tasks.find((task) => task.id === taskId)?.status === 'done') === completed) return;
    await this.attempt(taskId, async (id, version) => {
      const card = await api.tasks.complete(this.workspaceId, id, completed, version);
      this.upsertCard(card);
    });
  }

  private async patchTask(taskId: string, patch: TaskPatch): Promise<void> {
    await this.attempt(taskId, async (id, version) => {
      const body = {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.assigneeIds !== undefined ? { assigneeIds: patch.assigneeIds } : {}),
        ...(patch.reviewerId !== undefined ? { reviewerId: patch.reviewerId } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      };
      this.upsertDetail(await api.tasks.update(this.workspaceId, id, version, body));
    });
  }

  /**
   * Runs a versioned task change. The version comes from the last response or event; a stale one
   * (412) reloads the task as it is now, and any other failure puts the server's copy back.
   */
  private async attempt(taskId: string, change: (id: string, version: number) => Promise<void>): Promise<void> {
    try {
      const id = await this.serverId(taskId);
      let version = this.versions.get(id);
      if (version === undefined) {
        await this.refreshTask(id);
        version = this.versions.get(id) ?? 1;
      }
      await change(id, version);
    } catch (error) {
      this.fail(error);
      await this.refreshTask(taskId).catch(() => undefined);
    }
  }

  private upsertCard(card: TaskCard, replaceId?: string): void {
    const known = this.versions.get(card.id);
    if (known !== undefined && known > card.version) return;
    this.versions.set(card.id, card.version);
    const state = this.getState();
    const previous = state.tasks.find((task) => task.id === (replaceId ?? card.id));
    this.apply({ type: 'sync/upsert-task', task: taskFromCard(card, state.boardColumns, previous), ...(replaceId ? { replaceId } : {}) });
  }

  private upsertDetail(detail: TaskDetail, replaceId?: string): void {
    const known = this.versions.get(detail.id);
    if (known !== undefined && known > detail.version) return;
    this.versions.set(detail.id, detail.version);
    this.detailLoaded.add(detail.id);
    this.apply({ type: 'sync/upsert-task', task: taskFromDetail(detail, this.getState().boardColumns), ...(replaceId ? { replaceId } : {}) });
  }

  private async refreshTask(taskId: string): Promise<void> {
    const id = await this.serverId(taskId).catch(() => null);
    if (!id) return;
    try {
      const detail = await api.tasks.get(this.workspaceId, id);
      this.versions.delete(id);
      this.upsertDetail(detail);
    } catch (error) {
      if (isProblem(error, 'NOT_FOUND') || isProblem(error, 'FORBIDDEN')) this.apply({ type: 'sync/remove-task', taskId: id });
    }
  }

  /** Sends a subtask's new neighbours (from the reordered list) to the server. */
  private async moveSubtask(taskId: string, subtaskId: string, next: WorkspaceState): Promise<void> {
    const list = next.tasks.find((task) => task.id === taskId)?.subtasks ?? [];
    const index = list.findIndex((subtask) => subtask.id === subtaskId);
    if (index === -1 || isLocal(subtaskId)) return;
    const neighbour = (at: number) => {
      const id = list[at]?.id;
      return id && !isLocal(id) ? id : null;
    };
    try {
      await api.tasks.moveSubtask(this.workspaceId, await this.serverId(taskId), subtaskId, { afterId: neighbour(index - 1), beforeId: neighbour(index + 1) });
    } catch (error) {
      this.fail(error);
      await this.refreshTask(taskId).catch(() => undefined);
    }
  }

  /** Uploads picked files, then links each to the task. */
  private attachFiles(taskId: string, files: readonly PickedFile[]): void {
    this.run(async () => {
      const id = await this.serverId(taskId);
      for (const picked of files) {
        const stored = await uploadFile(this.workspaceId, picked.file, picked.name);
        await api.tasks.attach(this.workspaceId, id, stored.id);
      }
      await this.refreshTask(id);
      for (const picked of files) URL.revokeObjectURL(picked.previewUrl);
    }, () => this.refreshTask(taskId));
  }

  /* ---------------------------------------------------------------- board */

  private async addColumn(prev: WorkspaceState, next: WorkspaceState, title: string, tone: BoardColumn['tone']): Promise<void> {
    const local = next.boardColumns.find((column) => !prev.boardColumns.some((entry) => entry.id === column.id));
    if (!local?.projectId) return;
    const projectId = local.projectId;
    this.track(local.id, async () => {
      const view = await api.workflow.addColumn(this.workspaceId, { projectId: await this.serverId(projectId), title: title.trim(), tone, status: local.status });
      const created = view.columns.find((column) => !this.getState().boardColumns.some((entry) => entry.id === column.id));
      this.applyWorkflow(view, created ? { from: local.id, to: created.id } : undefined);
      return created?.id ?? local.id;
    });
  }

  /** One project's workflow, as a column change returned it; the other boards stay as they are. */
  private applyWorkflow(view: WorkflowView, rename?: { readonly from: string; readonly to: string }): void {
    const columns = columnsFromWorkflows([view]);
    const state = this.getState();
    this.apply({
      type: 'sync/merge',
      patch: {
        boardColumns: [
          ...state.boardColumns.filter((column) => column.projectId !== view.projectId && (!rename || column.id !== rename.from)),
          ...columns,
        ],
        tasks: rename
          ? state.tasks.map((task) => (task.boardColumnId === rename.from ? { ...task, boardColumnId: rename.to } : task))
          : state.tasks,
      },
    });
  }

  /** Every project's columns (one request), and the cards too after a column took some with it. */
  private async refreshWorkflow(withTasks = false): Promise<void> {
    const [views, cards] = await Promise.all([api.workflow.list(this.workspaceId), withTasks ? api.tasks.all(this.workspaceId) : Promise.resolve(null)]);
    const columns = columnsFromWorkflows(views);
    const state = this.getState();
    const previous = new Map(state.tasks.map((task) => [task.id, task]));
    if (cards) for (const card of cards) this.versions.set(card.id, card.version);
    this.apply({
      type: 'sync/merge',
      patch: {
        boardColumns: columns,
        ...(cards ? { tasks: cards.map((card) => taskFromCard(card, columns, previous.get(card.id))) } : {}),
      },
    });
  }

  /* ---------------------------------------------------------------- chat */

  private createConversation(draft: ConversationDraft, prev: WorkspaceState, next: WorkspaceState): void {
    const local = next.conversations.find((conversation) => !prev.conversations.some((entry) => entry.id === conversation.id));
    if (!local) return; // An existing direct chat was reopened.
    const me = next.meId;
    const others = draft.memberIds.filter((id) => id !== me);
    this.track(local.id, async () => {
      const detail =
        draft.kind === 'direct'
          ? await api.conversations.create(this.workspaceId, { kind: 'direct', userId: others[0] ?? me })
          : await api.conversations.create(this.workspaceId, { kind: 'group', title: draft.title, topic: draft.topic, tone: draft.tone, memberIds: others });
      this.cursorsFrom(detail);
      this.lastSeq.set(detail.id, detail.lastSeq);
      const selected = this.getState().activeConversationId === local.id;
      this.apply({ type: 'sync/upsert-conversation', conversation: this.conversationFrom(detail), replaceId: local.id, select: selected });
      // The optimistic "group created" line is replaced by the server's history.
      for (const message of this.getState().messages.filter((entry) => entry.conversationId === detail.id && isLocal(entry.id))) {
        this.apply({ type: 'sync/remove-message', messageId: message.id });
      }
      this.historyLoaded.delete(detail.id);
      void this.ensureHistory(detail.id);
      return detail.id;
    });
  }

  private sendMessage(conversationId: string, text: string, replyToId: string | null, prev: WorkspaceState, next: WorkspaceState): void {
    const local = next.messages.find((message) => message.conversationId === conversationId && !prev.messages.some((entry) => entry.id === message.id));
    if (!local) return;
    this.typing(conversationId, false);
    // One client id for every attempt: a resend after a lost acknowledgement is stored once.
    const clientMsgId = crypto.randomUUID();
    this.deliver(local.id, async () => {
      const sent = await this.post(conversationId, { clientMsgId, kind: 'text', text, ...(replyToId ? { replyToId: await this.serverId(replyToId) } : {}) });
      const id = await this.serverId(conversationId);
      const current = this.getState().messages.find((message) => message.id === local.id) ?? local;
      this.apply({ type: 'sync/upsert-messages', messages: [{ ...current, id: sent.id, conversationId: id, sentAt: sent.createdAt, readByIds: this.readersOf(id, sent.seq, next.meId) }], replaceId: local.id });
      return sent.id;
    });
  }

  /** Uploads the file, then sends it as a message (socket first, HTTP when the socket is down). */
  private sendFile(conversationId: string, localId: string, picked: PickedFile, caption: string | null, replyToId: string | null, asFile: boolean, next: WorkspaceState): void {
    const clientMsgId = crypto.randomUUID();
    // Kept across attempts: a resend after a failed send does not upload the file again.
    let stored: AttachmentView | null = null;
    this.deliver(
      localId,
      async () => {
        const attachment = stored ?? (await this.upload(picked.file, picked.name));
        stored = attachment;
        const sent = await this.post(conversationId, {
          clientMsgId,
          kind: 'file',
          attachmentId: attachment.id,
          ...(caption ? { text: caption } : {}),
          ...(asFile ? { asFile: true } : {}),
          ...(replyToId ? { replyToId: await this.serverId(replyToId) } : {}),
        });
        const current = this.getState().messages.find((message) => message.id === localId);
        const id = await this.serverId(conversationId);
        this.apply({
          type: 'sync/upsert-messages',
          messages: [
            {
              ...(current ?? { conversationId: id, authorId: next.meId, replyToId, reactions: [], edited: false, linkedTaskId: null }),
              id: sent.id,
              conversationId: id,
              sentAt: sent.createdAt,
              body: { kind: 'file', attachment: attachmentFromView(attachment), caption, ...(asFile ? { asFile: true } : {}) },
              readByIds: this.readersOf(id, sent.seq, next.meId),
            } as Message,
          ],
          replaceId: localId,
        });
        URL.revokeObjectURL(picked.previewUrl);
        return sent.id;
      },
      () => URL.revokeObjectURL(picked.previewUrl),
    );
  }

  /** Uploads the recording, then sends it as a voice note. */
  private sendVoice(conversationId: string, localId: string, recording: VoiceRecording, next: WorkspaceState): void {
    const clientMsgId = crypto.randomUUID();
    let stored: AttachmentView | null = null;
    this.deliver(
      localId,
      async () => {
        const extension = recording.blob.type.includes('ogg') ? 'ogg' : recording.blob.type.includes('mp4') ? 'm4a' : 'webm';
        const attachment = stored ?? (await this.upload(recording.blob, `voice-${Date.now()}.${extension}`));
        stored = attachment;
        const sent = await this.post(conversationId, { clientMsgId, kind: 'voice', attachmentId: attachment.id, durationSec: recording.durationSec, waveform: recording.waveform });
        const id = await this.serverId(conversationId);
        const current = this.getState().messages.find((message) => message.id === localId);
        this.apply({
          type: 'sync/upsert-messages',
          messages: [
            {
              ...(current ?? { conversationId: id, authorId: next.meId, replyToId: null, reactions: [], edited: false, linkedTaskId: null }),
              id: sent.id,
              conversationId: id,
              sentAt: sent.createdAt,
              // The local recording keeps playing until the page reloads; then the stored copy does.
              body: { kind: 'voice', durationSec: recording.durationSec, waveform: recording.waveform, src: recording.previewUrl, attachmentId: attachment.id },
              readByIds: this.readersOf(id, sent.seq, next.meId),
            } as Message,
          ],
          replaceId: localId,
        });
        return sent.id;
      },
      () => URL.revokeObjectURL(recording.previewUrl),
    );
  }

  /**
   * Sends one of this member's messages. A failure keeps it in the thread, marked unsent: «ارسال
   * دوباره» runs the same send again — the same client id, so the server stores it once however
   * many tries it takes — and «حذف» lets it go (`discard` frees what it held).
   */
  private deliver(localId: string, send: () => Promise<string>, discard?: () => void): void {
    const attempt = () => {
      this.unsent.delete(localId);
      this.track(localId, send, () => {
        // Gone meanwhile (the workspace changed): nothing left to resend.
        if (!this.getState().messages.some((message) => message.id === localId)) return discard?.();
        this.apply({ type: 'sync/message-failed', messageId: localId });
        this.unsent.set(localId, { retry: attempt, discard: () => discard?.() });
      });
    };
    attempt();
  }

  /** An upload for a message; a failure is said, and fails the send. */
  private async upload(blob: Blob, name: string): Promise<AttachmentView> {
    try {
      return await uploadFile(this.workspaceId, blob, name);
    } catch (error) {
      this.notify(problemMessage(error, 'بارگذاری فایل ممکن نشد.'));
      throw new Error('UPLOAD_FAILED');
    }
  }

  /** One send (socket, else HTTP with the same client id); a refusal is said, and fails the send. */
  private async post(conversationId: string, body: SendMessageBody): Promise<{ readonly id: string; readonly seq: number; readonly createdAt: string }> {
    const id = await this.serverId(conversationId);
    let sent = await this.realtime.send(id, body);
    if (!sent.ok && sent.code === 'SERVICE_UNAVAILABLE' && !this.realtime.connected) {
      // No socket right now: the same send over HTTP (the client id keeps it single).
      try {
        const rest = await http.post<{ readonly id: string; readonly seq: number; readonly createdAt: string; readonly duplicate: boolean }>(`/workspaces/${this.workspaceId}/conversations/${id}/messages`, body, { idempotent: true });
        sent = { ok: true, ...rest };
      } catch (error) {
        sent = { ok: false, code: error instanceof ApiProblem && error.code !== 'NETWORK' ? error.code : 'SERVICE_UNAVAILABLE' };
      }
    }
    if (!sent.ok) {
      this.notify(problemMessage(new ApiProblem(0, sent.code, sent.message ?? '', null), 'پیام ارسال نشد.'));
      throw new Error(sent.code);
    }
    this.seqOf.set(sent.id, sent.seq);
    this.lastSeq.set(id, Math.max(this.lastSeq.get(id) ?? 0, sent.seq));
    return sent;
  }

  /**
   * A signed link to a stored file, cached until a minute before it expires. A file just sent may
   * still be in its scan for a moment (404 until ready): a few short retries cover that.
   */
  private async fileLink(attachmentId: string, disposition: FileDisposition): Promise<string | null> {
    if (!this.workspaceId || isLocal(attachmentId)) return null;
    const key = `${disposition}:${attachmentId}`;
    const cached = this.links.get(key);
    if (cached && cached.expires > Date.now()) return cached.url;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const link = await api.files.link(this.workspaceId, attachmentId, disposition);
        this.links.set(key, { url: link.url, expires: Date.parse(link.expiresAt) - 60_000 });
        return link.url;
      } catch (error) {
        if (!isProblem(error, 'NOT_FOUND')) return null;
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
    return null;
  }

  private async react(messageId: string, emoji: string, next: WorkspaceState): Promise<void> {
    const on = next.messages.find((message) => message.id === messageId)?.reactions.some((reaction) => reaction.emoji === emoji && reaction.userIds.includes(next.meId)) ?? false;
    try {
      const id = await this.serverId(messageId);
      const ack = await this.realtime.react(id, emoji, on);
      if (ack.ok) {
        this.apply({ type: 'sync/reaction', messageId: id, emoji, userIds: ack.reaction.userIds });
        return;
      }
      const conversationId = next.messages.find((message) => message.id === messageId)?.conversationId ?? '';
      const path = `/workspaces/${this.workspaceId}/conversations/${conversationId}/messages/${id}/reactions/${encodeURIComponent(emoji)}`;
      const reaction = on ? await http.put<{ readonly userIds: readonly string[] }>(path) : await http.delete<{ readonly userIds: readonly string[] }>(path);
      this.apply({ type: 'sync/reaction', messageId: id, emoji, userIds: reaction.userIds });
    } catch (error) {
      this.fail(error);
    }
  }

  /** Moves this member's read cursor to the conversation's newest message. */
  private markRead(conversationId: string): void {
    if (isLocal(conversationId)) return;
    const seq = this.lastSeq.get(conversationId) ?? 0;
    const me = this.getState().meId;
    if (seq === 0 || (this.readCursors.get(conversationId)?.get(me) ?? 0) >= seq) return;
    this.cursor(conversationId, me, seq);
    void this.realtime.markRead(conversationId, seq).then((ack) => {
      if (!ack.ok && !this.realtime.connected) void http.post(`/workspaces/${this.workspaceId}/conversations/${conversationId}/read`, { seq }).catch(() => undefined);
    });
  }

  /* ---------------------------------------------------------------- notes, roles, sessions */

  /** A new note not yet sent: nothing of it exists on the server. */
  private isNoteDraft(noteId: string): boolean {
    return isLocal(noteId) && !this.pending.has(noteId);
  }

  /**
   * Stores a new note once it has a non-blank title or body, with everything set on it so far;
   * until then it is only a draft on this page, and an empty one is discarded, never saved.
   */
  private createNote(noteId: string): void {
    const draft = this.getState().notes.find((note) => note.id === noteId);
    if (!draft || (!draft.title.trim() && !draft.body.trim())) return;
    this.track(noteId, async () => {
      // No notebook named: the server files it in «شخصی» while that exists.
      const created = await api.notes.create(this.workspaceId, {
        ...(draft.categoryId !== null ? { categoryId: await this.serverId(draft.categoryId) } : {}),
        title: draft.title,
        body: draft.body,
        colors: draft.colors,
        pinned: draft.pinned,
      });
      this.noteVersions.set(created.id, created.version);
      // Deleted while it was being stored: `delete-note` removes it from the server too.
      const current = this.getState().notes.find((note) => note.id === noteId);
      if (!current) return created.id;
      this.apply({ type: 'sync/upsert-note', note: { ...noteFromView(created), title: current.title, body: current.body, colors: current.colors, pinned: current.pinned }, replaceId: noteId });
      // Typed on while the note was being created: the usual autosave sends the rest.
      if (current.title !== draft.title || current.body !== draft.body || current.colors !== draft.colors || current.pinned !== draft.pinned) this.saveNote(noteId);
      return created.id;
    });
  }

  private saveNote(noteId: string): void {
    clearTimeout(this.noteTimers.get(noteId));
    this.noteTimers.set(
      noteId,
      setTimeout(() => {
        this.noteTimers.delete(noteId);
        this.run(async () => {
          const id = await this.serverId(noteId);
          const note = this.getState().notes.find((entry) => entry.id === id);
          if (!note) return;
          const saved = await api.notes.update(this.workspaceId, id, this.noteVersions.get(id) ?? 1, {
            title: note.title,
            body: note.body,
            colors: note.colors,
            pinned: note.pinned,
            categoryId: note.categoryId === null ? null : await this.serverId(note.categoryId),
          });
          this.noteVersions.set(saved.id, saved.version);
        }, () => this.load(this.workspaceId, true));
      }, NOTE_SAVE_MS),
    );
  }

  private async saveRole(role: RoleId, matrix: PermissionMatrix): Promise<void> {
    const entry = this.roleIds.get(role);
    if (!entry) return;
    try {
      const saved = await http.put<RoleView>(`/workspaces/${this.workspaceId}/roles/${entry.id}/permissions`, { permissions: matrix[role] }, { ifMatch: entry.version });
      this.roleIds.set(role, { id: saved.id, version: saved.version });
    } catch (error) {
      this.fail(error);
      await this.refreshRoles();
    }
  }

  private async refreshRoles(): Promise<void> {
    const roles = await optional(api.workspaces.roles(this.workspaceId), []);
    this.roleIds = new Map(roles.map((role) => [role.key, { id: role.id, version: role.version }]));
    if (roles.length > 0) this.apply({ type: 'sync/merge', patch: { permissions: matrixFrom(roles) } });
  }

  private async refreshSessions(): Promise<void> {
    const sessions = await optional(api.sessions.list(), []);
    this.apply({ type: 'sync/merge', patch: { loginSessions: sessions.map(sessionFromView) } });
  }

  private async refreshMembers(): Promise<void> {
    const members = await api.workspaces.members(this.workspaceId, true);
    const departmentName = (id: string | null) => (id ? this.departments.get(id) : undefined);
    this.apply({
      type: 'sync/merge',
      patch: {
        users: members.filter((member) => member.status === 'active').map((member) => memberToUser(member, departmentName)),
        formerUsers: members.filter((member) => member.status === 'left').map((member) => memberToUser(member, departmentName)),
      },
    });
  }

  /** «آرشیو / سطل زباله»: the owner's view of deleted projects, as the server keeps them. */
  private async refreshScheduled(): Promise<void> {
    const scheduled = await api.scheduled.list(this.workspaceId);
    this.apply({ type: 'sync/merge', patch: { scheduledMessages: scheduled.map(scheduledFromView) } });
  }

  private async refreshWorkingHours(): Promise<void> {
    const hours = await api.workingHours.get(this.workspaceId);
    this.apply({ type: 'sync/merge', patch: { workingHours: workingHoursFromView(hours) } });
  }

  private async refreshProjectTrash(): Promise<void> {
    if (!this.getState().workspaces.some((workspace) => workspace.id === this.workspaceId && workspace.ownerId === this.getState().meId)) return;
    const departmentName = (id: string | null) => (id ? this.departments.get(id) : undefined);
    try {
      const trashed = await api.projects.trash(this.workspaceId);
      this.apply({ type: 'sync/project-trash', entries: trashed.map((entry) => trashedProjectFromView(entry, departmentName)) });
    } catch (error) {
      this.fail(error);
    }
  }

  private async refreshProjects(): Promise<void> {
    const projects = await api.projects.list(this.workspaceId);
    const departmentName = (id: string | null) => (id ? this.departments.get(id) : undefined);
    this.apply({ type: 'sync/merge', patch: { projects: projects.filter((project) => !project.archived).map((project) => projectFromView(project, departmentName)) } });
  }

  /** A workspace icon picked in the dialog (a data URL), sent to its upload ticket; returns the key. */
  private async uploadIcon(dataUrl: string): Promise<string> {
    const blob = await blobFromDataUrl(dataUrl);
    const ticket = await api.files.iconTicket();
    await postForm(ticket.url, ticket.fields, blob, blob.type || 'image/png');
    return ticket.key;
  }

  /* ================================================================ realtime */

  private receive(envelope: RealtimeEnvelope): void {
    if (this.buffered) {
      this.buffered.push(envelope);
      return;
    }
    if (envelope.workspaceId && envelope.workspaceId !== this.workspaceId && envelope.type !== 'notification:new') return;
    if (envelope.eventId) this.lastEventId = envelope.eventId;
    void this.handle(envelope).catch(() => undefined);
  }

  private async handle(envelope: RealtimeEnvelope): Promise<void> {
    const me = this.getState().meId;
    const event = <T extends RealtimeEventType>(type: T): RealtimeEventMap[T] | null => (envelope.type === type ? (envelope.data as RealtimeEventMap[T]) : null);
    switch (envelope.type) {
      case 'message:new':
      case 'message:updated': {
        const view = event(envelope.type);
        if (view) this.receiveMessage(view);
        return;
      }
      case 'message:deleted': {
        const data = event('message:deleted');
        const existing = data && this.getState().messages.find((message) => message.id === data.messageId);
        if (existing) this.apply({ type: 'sync/upsert-messages', messages: [{ ...existing, body: { kind: 'system', text: 'این پیام حذف شد.' }, reactions: [] }] });
        return;
      }
      case 'scheduled:updated': {
        // One of this member's schedules, from any of their devices (or the server's worker).
        const data = event('scheduled:updated');
        if (!data) return;
        const localId = this.scheduling.get(data.clientMsgId);
        if (data.status === 'pending') {
          this.apply({ type: 'sync/upsert-scheduled', scheduled: scheduledFromView(data), ...(localId ? { replaceId: localId } : {}) });
          return;
        }
        this.apply({ type: 'sync/remove-scheduled', scheduledId: data.id });
        if (data.status === 'failed') {
          const reason = codeMessage(data.failureCode);
          this.notify(reason ? `پیام زمان‌بندی‌شده ارسال نشد: ${reason}` : 'پیام زمان‌بندی‌شده ارسال نشد.');
        }
        return;
      }
      case 'reaction:updated': {
        const data = event('reaction:updated');
        if (data) this.apply({ type: 'sync/reaction', messageId: data.messageId, emoji: data.emoji, userIds: data.userIds });
        return;
      }
      case 'read:updated': {
        const data = event('read:updated');
        if (data) this.cursor(data.conversationId, data.userId, data.lastReadSeq);
        return;
      }
      case 'typing': {
        const data = event('typing');
        if (!data || data.userId === me) return;
        const key = `${data.conversationId}:${data.userId}`;
        clearTimeout(this.typingTimers.get(key));
        this.apply({ type: 'sync/typing', conversationId: data.conversationId, userId: data.userId, typing: data.typing });
        if (data.typing) {
          this.typingTimers.set(key, setTimeout(() => this.apply({ type: 'sync/typing', conversationId: data.conversationId, userId: data.userId, typing: false }), TYPING_MS));
        }
        return;
      }
      case 'presence:updated': {
        const data = event('presence:updated');
        if (!data) return;
        const known = this.getState().users.find((user) => user.id === data.userId)?.presence;
        const manual = data.presence ?? (known && known !== 'offline' ? known : 'online');
        this.apply({ type: 'sync/presence', userId: data.userId, presence: data.online ? manual : 'offline' });
        return;
      }
      case 'conversation:created':
      case 'conversation:updated':
      case 'conversation:member_added': {
        const data = envelope.data as { readonly conversationId: string };
        await this.refreshConversation(data.conversationId);
        return;
      }
      case 'conversation:member_removed': {
        const data = event('conversation:member_removed');
        if (!data) return;
        if (data.userId === me) this.apply({ type: 'sync/remove-conversation', conversationId: data.conversationId });
        else await this.refreshConversation(data.conversationId);
        return;
      }
      case 'message:task_linked': {
        const data = event('message:task_linked');
        if (data) this.apply({ type: 'sync/message-linked', messageId: data.messageId, taskId: data.taskId });
        return;
      }
      case 'task:created':
      case 'task:updated':
      case 'task:moved': {
        const data = envelope.data as { readonly taskId: string; readonly fields?: readonly string[] };
        const known = this.versions.get(data.taskId);
        // Checklist changes keep the task's version (see the API): they always refetch.
        const checklist = envelope.type === 'task:updated' && (data.fields ?? []).includes('subtasks');
        if (!checklist && known !== undefined && envelope.version !== undefined && envelope.version <= known) return;
        await this.refreshTask(data.taskId);
        return;
      }
      case 'task:deleted': {
        const data = event('task:deleted');
        if (data) this.apply({ type: 'sync/remove-task', taskId: data.taskId });
        return;
      }
      case 'board:column_added':
      case 'board:column_updated':
        await this.refreshWorkflow();
        return;
      case 'board:column_removed':
        await this.refreshWorkflow(true);
        return;
      case 'notification:new': {
        const data = event('notification:new');
        if (!data || data.workspaceId !== this.workspaceId) return;
        const notification = notificationFromView(data);
        if (notification) this.apply({ type: 'sync/upsert-notification', notification });
        return;
      }
      case 'member:joined':
      case 'member:removed':
        await this.refreshMembers();
        return;
      case 'permissions:updated':
        await Promise.all([this.refreshProjects(), this.refreshRoles(), this.refreshWorkflow(true)]);
        return;
      case 'workspace:removed':
        this.notify(
          event('workspace:removed')?.reason === 'suspended'
            ? (codeMessage('WORKSPACE_SUSPENDED') ?? 'این فضای کاری معلق شده است.')
            : 'دسترسی شما به این فضای کاری برداشته شد.',
        );
        await this.load();
        return;
      case 'session:revoked':
        await session.revoked();
        return;
      case 'auth:expired':
        await session.restore();
        return;
      case 'resync:required':
        await this.load(this.workspaceId, true);
        return;
      case 'server:draining':
        return;
    }
  }

  private receiveMessage(view: MessageView): void {
    const state = this.getState();
    if (!state.conversations.some((conversation) => conversation.id === view.conversationId)) {
      void this.refreshConversation(view.conversationId);
    }
    const isNew = !this.seqOf.has(view.id) && !state.messages.some((message) => message.id === view.id);
    this.seqOf.set(view.id, view.seq);
    this.lastSeq.set(view.conversationId, Math.max(this.lastSeq.get(view.conversationId) ?? 0, view.seq));
    const existing = state.messages.find((message) => message.id === view.id);
    const message = this.messageFrom(view);
    // A scheduled message sent from here with «ارسال فوری»: the server's copy takes the local one's place.
    const localId = view.clientMsgId ? this.sendingNow.get(view.clientMsgId) : undefined;
    if (localId && view.clientMsgId) this.sendingNow.delete(view.clientMsgId);
    this.apply({ type: 'sync/upsert-messages', messages: [existing ? { ...message, readByIds: existing.readByIds } : message], ...(localId ? { replaceId: localId } : {}) });
    if (!isNew || view.authorId === state.meId) return;
    const watching =
      state.activeConversationId === view.conversationId &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      window.location.pathname.startsWith('/chats');
    if (watching) this.markRead(view.conversationId);
    else this.apply({ type: 'sync/unread', conversationId: view.conversationId, count: (state.unreadByConversation[view.conversationId] ?? 0) + 1 });
  }

  private async refreshConversation(conversationId: string): Promise<void> {
    try {
      const detail = await api.conversations.get(this.workspaceId, conversationId);
      // Archived (a project's channel while the project is in the trash): out of the list.
      if (detail.archived) {
        this.apply({ type: 'sync/remove-conversation', conversationId });
        return;
      }
      this.cursorsFrom(detail);
      this.lastSeq.set(detail.id, Math.max(this.lastSeq.get(detail.id) ?? 0, detail.lastSeq));
      this.apply({ type: 'sync/upsert-conversation', conversation: this.conversationFrom(detail) });
    } catch (error) {
      if (isProblem(error, 'NOT_FOUND')) this.apply({ type: 'sync/remove-conversation', conversationId });
    }
  }

  /* ================================================================ helpers */

  private conversationFrom(view: ConversationView): ReturnType<typeof conversationFromView> {
    const { users, formerUsers } = this.getState();
    return conversationFromView(view, this.getState().meId, (userId) => [...users, ...formerUsers].find((user) => user.id === userId)?.fullName);
  }

  private messageFrom(view: MessageView): Message {
    this.seqOf.set(view.id, view.seq);
    const users = this.getState().users;
    const authorId = view.authorId ?? '';
    return messageFromView(view, this.readersOf(view.conversationId, view.seq, authorId), (userId) => users.find((user) => user.id === userId)?.fullName);
  }

  /** Everyone but the author whose read cursor has reached `seq`. */
  private readersOf(conversationId: string, seq: number, authorId: string): string[] {
    const cursors = this.readCursors.get(conversationId);
    if (!cursors) return [];
    return [...cursors].filter(([userId, read]) => userId !== authorId && read >= seq).map(([userId]) => userId);
  }

  private cursorsFrom(detail: ConversationDetail): void {
    this.readCursors.set(detail.id, new Map(detail.members.map((member) => [member.userId, member.lastReadSeq])));
  }

  /** A member's read cursor moved: their receipts appear on every message up to it. */
  private cursor(conversationId: string, userId: string, seq: number): void {
    const cursors = this.readCursors.get(conversationId) ?? new Map<string, number>();
    if ((cursors.get(userId) ?? 0) >= seq) return;
    cursors.set(userId, seq);
    this.readCursors.set(conversationId, cursors);
    const messageIds = this.getState()
      .messages.filter((message) => message.conversationId === conversationId && message.authorId !== userId && (this.seqOf.get(message.id) ?? Infinity) <= seq)
      .map((message) => message.id);
    if (messageIds.length > 0) this.apply({ type: 'sync/read', userId, messageIds });
  }

  /** The server id behind a (possibly still optimistic) local id. */
  private serverId(id: string): Promise<string> {
    return this.pending.get(id) ?? Promise.resolve(id);
  }

  /** Runs a create and remembers which server id the local one becomes, for changes made meanwhile. */
  private track(localId: string, create: () => Promise<string>, failed?: () => void): void {
    const created = create();
    this.pending.set(localId, created);
    created.catch((error: unknown) => {
      this.pending.delete(localId);
      if (!(error instanceof Error && /^[A-Z_]+$/.test(error.message))) this.fail(error);
      // By default the workspace is re-read; `failed` handles it instead (an unsent message stays).
      if (failed) failed();
      else void this.load(this.workspaceId, true);
    });
  }

  /** Runs a change; a failure is shown and `recover` re-reads what it touched. */
  private run(change: () => Promise<unknown>, recover?: () => Promise<unknown>): void {
    change().catch((error: unknown) => {
      this.fail(error);
      if (recover) void recover().catch(() => undefined);
    });
  }

  private fail(error: unknown): void {
    if (isProblem(error, 'UNAUTHENTICATED') || isProblem(error, 'SESSION_REVOKED')) {
      session.end();
      return;
    }
    this.notify(problemMessage(error));
  }
}

/* ================================================================== module helpers */

const isLocal = (id: string): boolean => id.includes('-local-');

/** A project's board columns the server knows (not ones still being created). */
const serverColumnsOf = (state: WorkspaceState, projectId: string): BoardColumn[] =>
  state.boardColumns.filter((column) => column.projectId === projectId && !isLocal(column.id));

/** A call whose refusal (no permission, not found) just means "nothing to show". */
async function optional<T>(call: Promise<T>, fallback: T): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof ApiProblem && (error.status === 403 || error.status === 404)) return fallback;
    throw error;
  }
}

function matrixFrom(roles: readonly RoleView[]): PermissionMatrix {
  const matrix: Record<string, PermissionMatrix[RoleId]> = { ...DEFAULT_PERMISSION_MATRIX };
  for (const role of roles) matrix[role.key] = role.permissions;
  return matrix as PermissionMatrix;
}

/** The sidebar shows each conversation's last message before its history is opened. */
function previewMessage(view: ConversationView, nameOf: (userId: string) => string | undefined): Message {
  const preview = view.lastMessage;
  if (!preview) throw new Error('no preview');
  return messageFromView(
    {
      id: preview.id,
      conversationId: view.id,
      seq: preview.seq,
      authorId: preview.authorId,
      kind: preview.kind,
      text: preview.text,
      meta: null,
      attachment: null,
      replyToId: null,
      mentionIds: [],
      reactions: [],
      clientMsgId: null,
      editedAt: null,
      deleted: preview.deleted,
      linkedTaskId: null,
      createdAt: preview.createdAt,
    },
    [],
    nameOf,
  );
}

/** Where the invitation token waits when session storage is refused. */
let pendingInvite: string | null = null;

/** `/invite?token=…` (the link in an invitation SMS or email): remember the token for after sign-in. */
function captureInvite(): void {
  if (typeof window === 'undefined' || !window.location.pathname.startsWith('/invite')) return;
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) keepInvite(token);
}

function keepInvite(token: string): void {
  try {
    window.sessionStorage.setItem(INVITE_KEY, token);
  } catch {
    // Without storage the link still works while this page stays open.
    pendingInvite = token;
  }
}

function peekInvite(): string | null {
  try {
    return window.sessionStorage.getItem(INVITE_KEY) ?? pendingInvite;
  } catch {
    return pendingInvite;
  }
}

function takeInvite(): string | null {
  let token = pendingInvite;
  pendingInvite = null;
  try {
    token = window.sessionStorage.getItem(INVITE_KEY) ?? token;
    window.sessionStorage.removeItem(INVITE_KEY);
  } catch {
    // See keepInvite.
  }
  return token;
}

function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function rememberWorkspace(workspaceId: string): void {
  try {
    window.localStorage.setItem(WORKSPACE_KEY, workspaceId);
  } catch {
    // Private windows may refuse storage; the first workspace opens next time instead.
  }
}
