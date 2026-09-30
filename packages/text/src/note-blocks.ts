import { CHECKLIST } from './markdown.js';

/**
 * A note seen as an editor sees it: runs of free text, and checklists whose items are real
 * records rather than `- [ ]` markers. The Markdown body stays the stored format — these
 * blocks are derived from it when editing starts and serialised back on every change.
 */
export interface ChecklistEntry {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

export type NoteBlock =
  | { readonly kind: 'text'; readonly id: string; readonly text: string }
  | { readonly kind: 'checklist'; readonly id: string; readonly items: readonly ChecklistEntry[] };

let sequence = 0;
/** Editor-local ids: stable keys and focus targets while a note is open, never persisted. */
export const blockId = (prefix: 'b' | 'i'): string => {
  sequence += 1;
  return `${prefix}${sequence}`;
};

export const checklistEntry = (text: string, done = false): ChecklistEntry => ({ id: blockId('i'), text, done });

export function parseNoteBlocks(body: string): readonly NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const match = CHECKLIST.exec(line);
    const last = blocks[blocks.length - 1];
    if (match) {
      const entry = checklistEntry(match[2] ?? '', match[1] !== ' ');
      if (last?.kind === 'checklist') blocks[blocks.length - 1] = { ...last, items: [...last.items, entry] };
      else blocks.push({ kind: 'checklist', id: blockId('b'), items: [entry] });
    } else if (last?.kind === 'text') {
      blocks[blocks.length - 1] = { ...last, text: `${last.text}\n${line}` };
    } else {
      blocks.push({ kind: 'text', id: blockId('b'), text: line });
    }
  }
  return normaliseNoteBlocks(blocks);
}

export function serialiseNoteBlocks(blocks: readonly NoteBlock[]): string {
  return blocks
    .map((block) =>
      block.kind === 'text'
        ? block.text
        : block.items.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n'),
    )
    .join('\n')
    .replace(/\s+$/, '');
}

/**
 * Keeps the block list well-formed: adjacent text runs merge, emptied checklists disappear,
 * and there is always a text block at the end so the caret has somewhere to go after a list.
 */
export function normaliseNoteBlocks(blocks: readonly NoteBlock[]): readonly NoteBlock[] {
  const out: NoteBlock[] = [];
  for (const block of blocks) {
    if (block.kind === 'checklist' && block.items.length === 0) continue;
    const last = out[out.length - 1];
    if (block.kind === 'text' && last?.kind === 'text') {
      out[out.length - 1] = { ...last, text: last.text && block.text ? `${last.text}\n${block.text}` : last.text || block.text };
    } else {
      out.push(block);
    }
  }
  if (out[out.length - 1]?.kind !== 'text') out.push({ kind: 'text', id: blockId('b'), text: '' });
  return out;
}
