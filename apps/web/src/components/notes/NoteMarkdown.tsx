'use client';

import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { parseInline, parseMarkdown } from '@taskin/text';
import { Checkbox } from '@/components/ui';

export interface NoteMarkdownProps {
  readonly source: string;
  /** Toggles the checklist item on `line`. Omit for a read-only render. */
  readonly onToggleLine?: (line: number) => void;
  readonly className?: string;
}

function Inline({ text }: { readonly text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        switch (token.kind) {
          case 'bold':
            return (
              <strong key={index} className="font-bold text-fg-primary">
                {token.text}
              </strong>
            );
          case 'italic':
            return (
              <em key={index} className="italic">
                {token.text}
              </em>
            );
          case 'code':
            return (
              <code key={index} className="latin-inline rounded bg-sunken px-1 py-0.5 text-caption text-fg-primary">
                {token.text}
              </code>
            );
          case 'text':
            return <Fragment key={index}>{token.text}</Fragment>;
          default: {
            const exhaustive: never = token;
            return exhaustive;
          }
        }
      })}
    </>
  );
}

/** Renders a note's Markdown subset as React elements, with live checklist checkboxes. */
export function NoteMarkdown({ source, onToggleLine, className }: NoteMarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  return (
    <div className={cn('flex flex-col gap-3 text-body leading-7 text-fg-secondary', className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            const size = block.level === 1 ? 'text-heading' : block.level === 2 ? 'text-title' : 'text-title-sm';
            return (
              <p key={index} role="heading" aria-level={block.level + 2} className={cn('font-bold text-fg-primary', size)}>
                <Inline text={block.text} />
              </p>
            );
          }
          case 'paragraph':
            return (
              <p key={index}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    <Inline text={line} />
                  </Fragment>
                ))}
              </p>
            );
          case 'quote':
            return (
              <blockquote key={index} className="border-s-2 border-brand ps-3 text-fg-tertiary">
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    <Inline text={line} />
                  </Fragment>
                ))}
              </blockquote>
            );
          case 'bullets':
            return (
              <ul key={index} className="flex list-disc flex-col gap-1 ps-5 marker:text-fg-quaternary">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case 'numbers':
            return (
              <ol key={index} className="numeric flex list-decimal flex-col gap-1 ps-5 marker:text-fg-quaternary">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ol>
            );
          case 'checklist':
            return (
              <ul key={index} className="flex flex-col gap-1.5" aria-label="چک‌لیست">
                {block.items.map((item) => (
                  <li key={item.line} className="flex items-start gap-2.5">
                    <Checkbox
                      checked={item.done}
                      size="sm"
                      tone="success"
                      disabled={!onToggleLine}
                      onCheckedChange={() => onToggleLine?.(item.line)}
                      label={
                        <span className={cn('text-body leading-7', item.done ? 'text-fg-tertiary line-through' : 'text-fg-secondary')}>
                          <Inline text={item.text} />
                        </span>
                      }
                      className="mt-1.5"
                    />
                  </li>
                ))}
              </ul>
            );
          default: {
            const exhaustive: never = block;
            return exhaustive;
          }
        }
      })}
    </div>
  );
}
