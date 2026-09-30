/**
 * The Markdown subset notes are written in, parsed into plain data. Rendering happens in
 * React (`NoteMarkdown`), never through `innerHTML`, so a note can contain `<script>` and it
 * is shown as text.
 *
 *   # / ## / ###        headings
 *   - item / * item      bullet list
 *   1. item              numbered list
 *   - [ ] / - [x] item   checklist (toggleable in preview)
 *   > quote              quote
 *   **bold** *italic* `code`
 */

export type MarkdownBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: readonly string[] }
  | { readonly kind: 'quote'; readonly lines: readonly string[] }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  | { readonly kind: 'numbers'; readonly items: readonly string[] }
  | { readonly kind: 'checklist'; readonly items: readonly ChecklistItem[] };

export interface ChecklistItem {
  readonly text: string;
  readonly done: boolean;
  /** Source line, so toggling rewrites exactly that line. */
  readonly line: number;
}

export type InlineToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'italic'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

const HEADING = /^(#{1,3})\s+(.*)$/;
export const CHECKLIST = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseMarkdown(source: string): readonly MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  // Appends to the previous block when it is the same list/quote/paragraph kind.
  const extend = <K extends MarkdownBlock['kind']>(
    kind: K,
    make: () => Extract<MarkdownBlock, { kind: K }>,
    grow: (block: Extract<MarkdownBlock, { kind: K }>) => Extract<MarkdownBlock, { kind: K }>,
  ) => {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind) {
      blocks[blocks.length - 1] = grow(last as Extract<MarkdownBlock, { kind: K }>);
    } else {
      blocks.push(make());
    }
  };

  lines.forEach((raw, line) => {
    const text = raw.trimEnd();
    if (text.trim() === '') {
      // A blank line ends the current paragraph/list; the next line starts a new block.
      if (blocks.length > 0 && blocks[blocks.length - 1]?.kind !== 'paragraph') return;
      blocks.push({ kind: 'paragraph', lines: [] });
      return;
    }

    const heading = HEADING.exec(text);
    if (heading) {
      const level = Math.min(3, heading[1]?.length ?? 1) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2] ?? '' });
      return;
    }

    const check = CHECKLIST.exec(text);
    if (check) {
      const item: ChecklistItem = { text: check[2] ?? '', done: check[1] !== ' ', line };
      extend('checklist', () => ({ kind: 'checklist', items: [item] }), (block) => ({
        kind: 'checklist',
        items: [...block.items, item],
      }));
      return;
    }

    const bullet = BULLET.exec(text);
    if (bullet) {
      const item = bullet[1] ?? '';
      extend('bullets', () => ({ kind: 'bullets', items: [item] }), (block) => ({
        kind: 'bullets',
        items: [...block.items, item],
      }));
      return;
    }

    const numbered = NUMBERED.exec(text);
    if (numbered) {
      const item = numbered[1] ?? '';
      extend('numbers', () => ({ kind: 'numbers', items: [item] }), (block) => ({
        kind: 'numbers',
        items: [...block.items, item],
      }));
      return;
    }

    const quote = QUOTE.exec(text);
    if (quote) {
      const quoted = quote[1] ?? '';
      extend('quote', () => ({ kind: 'quote', lines: [quoted] }), (block) => ({
        kind: 'quote',
        lines: [...block.lines, quoted],
      }));
      return;
    }

    extend('paragraph', () => ({ kind: 'paragraph', lines: [text] }), (block) => ({
      kind: 'paragraph',
      lines: [...block.lines, text],
    }));
  });

  return blocks.filter((block) => block.kind !== 'paragraph' || block.lines.length > 0);
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function parseInline(text: string): readonly InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, index) });
    const value = match[0];
    if (value.startsWith('**')) tokens.push({ kind: 'bold', text: value.slice(2, -2) });
    else if (value.startsWith('`')) tokens.push({ kind: 'code', text: value.slice(1, -1) });
    else tokens.push({ kind: 'italic', text: value.slice(1, -1) });
    cursor = index + value.length;
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens;
}

/** Flips `[ ]` ↔ `[x]` on one source line. */
export function toggleChecklistLine(source: string, line: number): string {
  const lines = source.split('\n');
  const target = lines[line];
  if (target === undefined) return source;
  lines[line] = target.replace(/\[([ xX])\]/, (_, mark: string) => (mark === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

export function checklistProgress(source: string): { readonly done: number; readonly total: number } {
  let done = 0;
  let total = 0;
  for (const line of source.split('\n')) {
    const match = CHECKLIST.exec(line);
    if (!match) continue;
    total += 1;
    if (match[1] !== ' ') done += 1;
  }
  return { done, total };
}

/**
 * Splits a note for "تبدیل یادداشت به وظیفه": open checklist items become subtasks, and the
 * rest of the text (ticked items included, as context) becomes the description.
 */
export function splitForTask(source: string): { readonly description: string; readonly subtasks: readonly string[] } {
  const subtasks: string[] = [];
  const kept: string[] = [];
  for (const line of source.split('\n')) {
    const match = CHECKLIST.exec(line);
    if (match && match[1] === ' ' && (match[2] ?? '').trim()) {
      subtasks.push(stripInline((match[2] ?? '').trim()));
    } else {
      kept.push(line);
    }
  }
  return { description: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), subtasks };
}

/** Plain text for list previews and titles. */
export function stripInline(text: string): string {
  return parseInline(text)
    .map((token) => token.text)
    .join('');
}

export function notePreview(source: string, maxChars = 90): string {
  const first = source
    .split('\n')
    .map((line) => line.replace(/^(#{1,3}\s+|\s*[-*]\s+(\[[ xX]\]\s?)?|\s*\d+[.)]\s+|>\s?)/, '').trim())
    .find(Boolean);
  if (!first) return '';
  const plain = stripInline(first);
  return plain.length > maxChars ? `${plain.slice(0, maxChars).trimEnd()}…` : plain;
}
