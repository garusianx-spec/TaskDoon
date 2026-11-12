import type {
  ConvertNoteBody,
  ConvertNoteResult,
  CreateNoteBody,
  NoteCategoryView,
  NotePage,
  NoteView,
  UpdateNoteBody,
} from '@taskin/contracts';
import { http, query } from '@/lib/api-client';
import { workspacePath, everyPage } from '@/lib/api-routing';

export const notesEndpoints = {
  notes: {
    categories: (workspaceId: string) =>
      http.get<NoteCategoryView[]>(`${workspacePath(workspaceId)}/note-categories`),
    createCategory: (workspaceId: string, label: string) =>
      http.post<NoteCategoryView>(
        `${workspacePath(workspaceId)}/note-categories`,
        { label },
        { idempotent: true },
      ),
    removeCategory: (workspaceId: string, categoryId: string) =>
      http.delete<void>(`${workspacePath(workspaceId)}/note-categories/${categoryId}`),
    all: (workspaceId: string) =>
      everyPage<NoteView>((cursor) =>
        http.get<NotePage>(`${workspacePath(workspaceId)}/notes${query({ limit: 100, cursor })}`),
      ),
    create: (workspaceId: string, body: CreateNoteBody, idempotencyKey?: string) =>
      http.post<NoteView>(`${workspacePath(workspaceId)}/notes`, body, {
        idempotent: true,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
    update: (workspaceId: string, noteId: string, version: number, body: UpdateNoteBody) =>
      http.patch<NoteView>(`${workspacePath(workspaceId)}/notes/${noteId}`, body, { ifMatch: version }),
    remove: (workspaceId: string, noteId: string) =>
      http.delete<void>(`${workspacePath(workspaceId)}/notes/${noteId}`),
    /** "تبدیل یادداشت به وظیفه": open checklist items become subtasks. */
    convert: (workspaceId: string, noteId: string, body: ConvertNoteBody) =>
      http.post<ConvertNoteResult>(`${workspacePath(workspaceId)}/notes/${noteId}/task`, body, {
        idempotent: true,
      }),
  },
};
