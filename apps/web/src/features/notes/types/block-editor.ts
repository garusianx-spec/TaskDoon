export interface NoteBlockEditorHandle {
  /** Wraps the selection in the active text block (`**`, `*`). */
  readonly wrap: (marker: string, placeholder: string) => void;
  /** Toggles a line prefix (`## `, `- `) on the selected lines of the active text block. */
  readonly prefixLines: (prefix: string) => void;
  /** Turns the caret's line into a checklist item, or adds an item after the focused one. */
  readonly insertChecklistItem: () => void;
  /** Puts the caret at the start of the note. */
  readonly focus: () => void;
}

export interface NoteBlockEditorProps {
  readonly initialBody: string;
  readonly onChange: (body: string) => void;
}
