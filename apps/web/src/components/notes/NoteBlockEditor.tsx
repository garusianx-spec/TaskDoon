'use client';

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/cn';
import {
  blockId,
  checklistEntry,
  normaliseNoteBlocks,
  parseNoteBlocks,
  serialiseNoteBlocks,
  type ChecklistEntry,
  type NoteBlock,
} from '@taskin/text';
import { Checkbox, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/icons';

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

type FocusTarget = { readonly id: string; readonly at: number | 'end' };

/** A line typed as `- [ ] `, `[] ` or `[x] ` becomes a checklist item on the spot. */
const CHECKLIST_SHORTCUT = /^\s*(?:[-*]\s)?\[([ xX]?)\]\s$/;
/** List continuation for plain Markdown lists inside text blocks. */
const LIST_PREFIX = /^(\s*)([-*] |(\d+)[.)] )/;

/**
 * Editing surface for a note. Free text stays Markdown in auto-growing text areas, but
 * checklists are edited as checklists: every item is a real checkbox beside its own text
 * field, struck through when done — no `[ ]` / `[x]` markers on screen.
 *
 * Keyboard: Enter splits an item (or, on an empty item, leaves the list); Backspace at the
 * start merges into the previous item (or turns the first item back into text); ArrowUp /
 * ArrowDown walk between items and text.
 */
export const NoteBlockEditor = forwardRef<NoteBlockEditorHandle, NoteBlockEditorProps>(function NoteBlockEditor(
  { initialBody, onChange },
  ref,
) {
  const [blocks, setBlocks] = useState<readonly NoteBlock[]>(() => parseNoteBlocks(initialBody));
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const pendingFocus = useRef<FocusTarget | null>(null);
  /** The text block the toolbar acts on: the last one that had focus. */
  const activeText = useRef<string | null>(null);

  const commit = (next: readonly NoteBlock[], focus?: FocusTarget) => {
    const normalised = normaliseNoteBlocks(next);
    if (focus) pendingFocus.current = focus;
    setBlocks(normalised);
    onChange(serialiseNoteBlocks(normalised));
  };

  // After each render, honour a requested caret position (new item, merged item, …).
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const field = fields.current.get(target.id);
    if (!field) return;
    field.focus();
    const position = target.at === 'end' ? field.value.length : Math.min(target.at, field.value.length);
    field.setSelectionRange(position, position);
  });

  const register = (id: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (node) fields.current.set(id, node);
    else fields.current.delete(id);
  };

  /** Ordered focus stops, for ArrowUp / ArrowDown. */
  const stops = (): readonly string[] =>
    blocks.flatMap((block) => (block.kind === 'text' ? [block.id] : block.items.map((item) => item.id)));

  const moveFocus = (fromId: string, delta: number): boolean => {
    const order = stops();
    const target = order[order.indexOf(fromId) + delta];
    if (!target) return false;
    pendingFocus.current = { id: target, at: delta < 0 ? 'end' : 0 };
    setBlocks((current) => [...current]);
    return true;
  };

  const updateBlock = (id: string, update: (block: NoteBlock) => readonly NoteBlock[]): readonly NoteBlock[] =>
    blocks.flatMap((block) => (block.id === id ? update(block) : [block]));

  const updateItem = (listId: string, itemId: string, patch: Partial<ChecklistEntry>) =>
    commit(
      updateBlock(listId, (block) =>
        block.kind === 'checklist'
          ? [{ ...block, items: block.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }]
          : [block],
      ),
    );

  /** Splits a text block at one of its lines, putting a checklist item in that line's place. */
  const lineToChecklist = (textBlockId: string, lineIndex: number, itemText: string, done: boolean) => {
    const entry = checklistEntry(itemText, done);
    commit(
      updateBlock(textBlockId, (block) => {
        if (block.kind !== 'text') return [block];
        const lines = block.text.split('\n');
        const before = lines.slice(0, lineIndex).join('\n');
        const after = lines.slice(lineIndex + 1).join('\n');
        return [
          ...(lineIndex > 0 ? [{ kind: 'text' as const, id: block.id, text: before }] : []),
          { kind: 'checklist' as const, id: blockId('b'), items: [entry] },
          ...(lineIndex < lines.length - 1 ? [{ kind: 'text' as const, id: blockId('b'), text: after }] : []),
        ];
      }),
      { id: entry.id, at: 'end' },
    );
  };

  const caretLine = (field: HTMLTextAreaElement): number =>
    field.value.slice(0, field.selectionStart).split('\n').length - 1;

  const activeTextarea = (): HTMLTextAreaElement | null => {
    const fallback = [...blocks].reverse().find((block) => block.kind === 'text')?.id ?? null;
    const field = fields.current.get(activeText.current ?? fallback ?? '');
    return field instanceof HTMLTextAreaElement ? field : null;
  };

  const setText = (id: string, text: string, caret: number) =>
    commit(updateBlock(id, (block) => (block.kind === 'text' ? [{ ...block, text }] : [block])), { id, at: caret });

  useImperativeHandle(ref, () => ({
    focus() {
      const first = stops()[0];
      if (first) fields.current.get(first)?.focus();
    },
    wrap(marker, placeholder) {
      const field = activeTextarea();
      if (!field) return;
      const id = [...fields.current].find(([, node]) => node === field)?.[0];
      if (!id) return;
      const { selectionStart: start, selectionEnd: end, value } = field;
      const selected = value.slice(start, end) || placeholder;
      setText(id, `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`, start + marker.length + selected.length);
    },
    prefixLines(prefix) {
      const field = activeTextarea();
      if (!field) return;
      const id = [...fields.current].find(([, node]) => node === field)?.[0];
      if (!id) return;
      const { selectionStart, selectionEnd, value } = field;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const lineEndIndex = value.indexOf('\n', selectionEnd);
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
      const lines = value.slice(lineStart, lineEnd).split('\n');
      const all = lines.every((line) => line.startsWith(prefix));
      const next = lines.map((line) => (all ? line.slice(prefix.length) : `${prefix}${line}`)).join('\n');
      setText(id, value.slice(0, lineStart) + next + value.slice(lineEnd), lineStart + next.length);
    },
    insertChecklistItem() {
      const focused = document.activeElement;
      const owner = blocks.find(
        (block) => block.kind === 'checklist' && block.items.some((item) => fields.current.get(item.id) === focused),
      );
      if (owner && owner.kind === 'checklist') {
        const index = owner.items.findIndex((item) => fields.current.get(item.id) === focused);
        const entry = checklistEntry('');
        commit(
          updateBlock(owner.id, (block) =>
            block.kind === 'checklist'
              ? [{ ...block, items: [...block.items.slice(0, index + 1), entry, ...block.items.slice(index + 1)] }]
              : [block],
          ),
          { id: entry.id, at: 0 },
        );
        return;
      }
      const field = activeTextarea();
      const id = field ? [...fields.current].find(([, node]) => node === field)?.[0] : undefined;
      if (!field || !id) return;
      const line = caretLine(field);
      lineToChecklist(id, line, field.value.split('\n')[line] ?? '', false);
    },
  }));

  const onTextChange = (block: Extract<NoteBlock, { kind: 'text' }>, field: HTMLTextAreaElement) => {
    const { value, selectionStart } = field;
    const line = value.slice(0, selectionStart).split('\n').length - 1;
    const lineText = value.split('\n')[line] ?? '';
    const shortcut = CHECKLIST_SHORTCUT.exec(lineText);
    if (shortcut && selectionStart === value.split('\n').slice(0, line + 1).join('\n').length) {
      // Commit the typed text first so the split works on what is on screen.
      const typed = { ...block, text: value };
      const lines = value.split('\n');
      const entry = checklistEntry('', (shortcut[1] ?? '').toLowerCase() === 'x');
      commit(
        blocks.flatMap((candidate) =>
          candidate.id !== typed.id
            ? [candidate]
            : [
                ...(line > 0 ? [{ kind: 'text' as const, id: typed.id, text: lines.slice(0, line).join('\n') }] : []),
                { kind: 'checklist' as const, id: blockId('b'), items: [entry] },
                ...(line < lines.length - 1
                  ? [{ kind: 'text' as const, id: blockId('b'), text: lines.slice(line + 1).join('\n') }]
                  : []),
              ],
        ),
        { id: entry.id, at: 0 },
      );
      return;
    }
    commit(updateBlock(block.id, () => [{ ...block, text: value }]));
  };

  const onTextKeyDown = (block: Extract<NoteBlock, { kind: 'text' }>) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const { selectionStart, selectionEnd, value } = field;

    if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'i')) {
      event.preventDefault();
      const marker = event.key === 'b' ? '**' : '*';
      const selected = value.slice(selectionStart, selectionEnd) || (event.key === 'b' ? 'متن پررنگ' : 'متن مورب');
      setText(block.id, `${value.slice(0, selectionStart)}${marker}${selected}${marker}${value.slice(selectionEnd)}`, selectionStart + marker.length + selected.length);
      return;
    }

    if (event.key === 'ArrowUp' && !value.slice(0, selectionStart).includes('\n')) {
      if (moveFocus(block.id, -1)) event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' && !value.slice(selectionEnd).includes('\n')) {
      if (moveFocus(block.id, 1)) event.preventDefault();
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || selectionStart !== selectionEnd) return;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const match = LIST_PREFIX.exec(value.slice(lineStart, selectionStart));
    if (!match) return;
    event.preventDefault();
    const [prefix, indent = '', marker = '', number] = match;
    if (value.slice(lineStart + prefix.length, selectionStart).trim() === '') {
      setText(block.id, value.slice(0, lineStart) + value.slice(selectionStart), lineStart);
      return;
    }
    const insert = `\n${indent}${number !== undefined ? `${Number(number) + 1}. ` : marker}`;
    setText(block.id, value.slice(0, selectionStart) + insert + value.slice(selectionStart), selectionStart + insert.length);
  };

  const onItemKeyDown =
    (list: Extract<NoteBlock, { kind: 'checklist' }>, item: ChecklistEntry, index: number) =>
    (event: KeyboardEvent<HTMLInputElement>) => {
      const field = event.currentTarget;
      const caret = field.selectionStart ?? 0;
      const collapsed = caret === (field.selectionEnd ?? 0);

      if (event.key === 'Enter') {
        event.preventDefault();
        if (item.text.trim() === '') {
          // An empty item leaves the list: drop it and continue in the text that follows.
          const listIndex = blocks.indexOf(list);
          const after = blocks[listIndex + 1];
          const remainingItems = list.items.filter((entry) => entry.id !== item.id);
          const trailing = list.items.slice(index + 1);
          const textBlock =
            after?.kind === 'text' && trailing.length === 0 ? after : { kind: 'text' as const, id: blockId('b'), text: '' };
          commit(
            [
              ...blocks.slice(0, listIndex),
              ...(trailing.length === 0
                ? [{ ...list, items: remainingItems }]
                : [
                    { ...list, items: list.items.slice(0, index) },
                    textBlock,
                    { kind: 'checklist' as const, id: blockId('b'), items: trailing },
                  ]),
              ...(trailing.length === 0 && textBlock !== after ? [textBlock] : []),
              ...blocks.slice(listIndex + 1),
            ],
            { id: textBlock.id, at: 0 },
          );
          return;
        }
        const entry = checklistEntry(item.text.slice(caret));
        commit(
          updateBlock(list.id, () => [
            {
              ...list,
              items: [
                ...list.items.slice(0, index),
                { ...item, text: item.text.slice(0, caret) },
                entry,
                ...list.items.slice(index + 1),
              ],
            },
          ]),
          { id: entry.id, at: 0 },
        );
        return;
      }

      if (event.key === 'Backspace' && collapsed && caret === 0) {
        event.preventDefault();
        const previous = list.items[index - 1];
        if (previous) {
          commit(
            updateBlock(list.id, () => [
              {
                ...list,
                items: list.items
                  .filter((entry) => entry.id !== item.id)
                  .map((entry) => (entry.id === previous.id ? { ...entry, text: previous.text + item.text } : entry)),
              },
            ]),
            { id: previous.id, at: previous.text.length },
          );
          return;
        }
        // The first item turns back into a line of text just before the list.
        const text = { kind: 'text' as const, id: blockId('b'), text: item.text };
        const listIndex = blocks.indexOf(list);
        const before = blocks[listIndex - 1];
        const focusId = before?.kind === 'text' ? before.id : text.id;
        const focusAt = before?.kind === 'text' ? (before.text ? before.text.length + 1 : 0) : 0;
        commit(
          [
            ...blocks.slice(0, listIndex),
            text,
            { ...list, items: list.items.slice(1) },
            ...blocks.slice(listIndex + 1),
          ],
          { id: focusId, at: focusAt },
        );
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (moveFocus(item.id, event.key === 'ArrowUp' ? -1 : 1)) event.preventDefault();
      }
    };

  const onlyBlock = blocks.length === 1 && blocks[0]?.kind === 'text' && blocks[0].text === '';

  return (
    <div className="flex min-h-[45vh] flex-col gap-2 rounded-lg border border-secondary bg-surface p-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
      {blocks.map((block) =>
        block.kind === 'text' ? (
          <AutoGrowTextarea
            key={block.id}
            ref={register(block.id)}
            value={block.text}
            onFocus={() => {
              activeText.current = block.id;
            }}
            onChange={(field) => onTextChange(block, field)}
            onKeyDown={onTextKeyDown(block)}
            placeholder={onlyBlock ? 'متن یادداشت را بنویسید… برای چک‌لیست «[] » تایپ کنید.' : undefined}
            // Trailing empty text after a list only needs to be reachable, not tall.
            compact={block.text === '' && !onlyBlock}
          />
        ) : (
          <ul key={block.id} aria-label="چک‌لیست" className="flex flex-col gap-1">
            {block.items.map((item, index) => (
              <li key={item.id} className="group/item flex items-center gap-2.5 rounded-md ps-0.5">
                <Checkbox
                  checked={item.done}
                  size="sm"
                  tone="success"
                  ariaLabel={item.text ? `انجام شد: ${item.text}` : 'مورد خالی چک‌لیست'}
                  onCheckedChange={(done) => updateItem(block.id, item.id, { done })}
                />
                <input
                  ref={register(item.id)}
                  value={item.text}
                  aria-label="متن مورد چک‌لیست"
                  placeholder="مورد جدید"
                  onChange={(event) => updateItem(block.id, item.id, { text: event.target.value })}
                  onKeyDown={onItemKeyDown(block, item, index)}
                  className={cn(
                    'h-8 min-w-0 flex-1 bg-transparent text-body leading-7 outline-none transition-[color,opacity] placeholder:text-fg-placeholder',
                    'focus-visible:ring-0 focus-visible:ring-offset-0',
                    item.done ? 'text-fg-secondary line-through opacity-75' : 'text-fg-primary',
                  )}
                />
                <IconButton
                  label={`حذف مورد «${item.text || 'خالی'}»`}
                  icon={<CloseIcon size={14} />}
                  size="xs"
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within/item:opacity-100 group-hover/item:opacity-100"
                  onClick={() => {
                    const previous = block.items[index - 1] ?? block.items[index + 1];
                    commit(
                      updateBlock(block.id, () => [{ ...block, items: block.items.filter((entry) => entry.id !== item.id) }]),
                      previous ? { id: previous.id, at: 'end' } : undefined,
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
});

interface AutoGrowTextareaProps {
  readonly value: string;
  readonly onChange: (field: HTMLTextAreaElement) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onFocus: () => void;
  readonly placeholder: string | undefined;
  readonly compact: boolean;
}

/** A borderless textarea that grows with its content instead of scrolling inside the note. */
const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(function AutoGrowTextarea(
  { value, onChange, onKeyDown, onFocus, placeholder, compact },
  forwardedRef,
) {
  const local = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const field = local.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(node) => {
        local.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      aria-label="متن یادداشت"
      rows={compact ? 1 : 3}
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.currentTarget)}
      onKeyDown={onKeyDown}
      className="w-full resize-none overflow-hidden bg-transparent text-body leading-7 text-fg-primary outline-none placeholder:text-fg-placeholder focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  );
});
