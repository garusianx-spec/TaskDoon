'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { AutoGrowTextarea } from '@/features/notes/components/AutoGrowTextarea';
import { type NoteBlockEditorHandle, type NoteBlockEditorProps } from '@/features/notes/types/block-editor';

import { useNoteBlocks } from '@/features/notes/hooks/useNoteBlocks';

/**
 * Editing surface for a note. Free text stays Markdown in auto-growing text areas, but
 * checklists are edited as checklists: every item is a real checkbox beside its own text
 * field, struck through when done — no `[ ]` / `[x]` markers on screen.
 *
 * Keyboard: Enter splits an item (or, on an empty item, leaves the list); Backspace at the
 * start merges into the previous item (or turns the first item back into text); ArrowUp /
 * ArrowDown walk between items and text.
 */
export const NoteBlockEditor = forwardRef<NoteBlockEditorHandle, NoteBlockEditorProps>(
  function NoteBlockEditor({ initialBody, onChange }, ref) {
    const {
      blocks,
      register,
      onTextChange,
      onTextKeyDown,
      updateItem,
      onItemKeyDown,
      commit,
      updateBlock,
      onlyBlock,
      focusText,
    } = useNoteBlocks({ initialBody, onChange }, ref);

    return (
      <div className="flex min-h-[45vh] flex-col gap-2 rounded-lg border border-secondary bg-surface p-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
        {blocks.map((block) =>
          block.kind === 'text' ? (
            <AutoGrowTextarea
              key={block.id}
              ref={register(block.id)}
              value={block.text}
              onFocus={() => focusText(block.id)}
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
                        updateBlock(block.id, () => [
                          { ...block, items: block.items.filter((entry) => entry.id !== item.id) },
                        ]),
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
  },
);
