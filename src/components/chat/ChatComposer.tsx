'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconButton, Tooltip } from '@/components/ui';
import { CloseIcon, EmojiIcon, MicrophoneIcon, PaperclipIcon, SendIcon } from '@/components/icons';

export interface ChatComposerProps {
  readonly onSend: (text: string) => void;
  readonly replyPreview: { readonly authorName: string; readonly preview: string } | null;
  readonly onCancelReply: () => void;
  readonly conversationTitle: string;
  /** Set after a cross-module jump (e.g. from the directory) so typing can start at once. */
  readonly autoFocus?: boolean;
  readonly onAutoFocusHandled?: () => void;
}

const EMOJI_PALETTE = ['👍', '🙏', '🔥', '✅', '👀', '🎉', '❤️', '😀', '🤝', '⚡️'] as const;

/**
 * Message composer. Enter sends, Shift+Enter inserts a newline, and the textarea grows with
 * the content up to six lines before scrolling.
 */
export function ChatComposer({
  onSend,
  replyPreview,
  onCancelReply,
  conversationTitle,
  autoFocus = false,
  onAutoFocusHandled,
}: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
    onAutoFocusHandled?.();
  }, [autoFocus, onAutoFocusHandled]);

  const resize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      element.focus();
    }
  };

  const insertEmoji = (emoji: string) => {
    setDraft((current) => `${current}${emoji}`);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-secondary bg-surface p-3">
      {replyPreview && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-s-2 border-brand bg-sunken px-3 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-caption font-semibold text-fg-brand">
              {`پاسخ به ${replyPreview.authorName}`}
            </span>
            <span className="truncate text-caption text-fg-tertiary">{replyPreview.preview}</span>
          </span>
          <IconButton
            label="لغو پاسخ"
            icon={<CloseIcon size={16} />}
            size="xs"
            onClick={onCancelReply}
          />
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-primary bg-surface p-1.5 shadow-xs focus-within:border-brand">
        <div className="relative flex">
          <Tooltip content="درج ایموجی">
            <IconButton
              label="درج ایموجی"
              icon={<EmojiIcon size={20} />}
              size="sm"
              onClick={() => setEmojiOpen((open) => !open)}
              aria-expanded={emojiOpen}
            />
          </Tooltip>
          {emojiOpen && (
            <div
              role="dialog"
              aria-label="انتخاب ایموجی"
              className="surface-floating absolute bottom-[calc(100%+0.5rem)] start-0 z-popover grid w-56 animate-scale-in grid-cols-5 gap-1 p-2"
            >
              {EMOJI_PALETTE.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`درج ${emoji}`}
                  onClick={() => insertEmoji(emoji)}
                  className="flex size-9 items-center justify-center rounded-lg text-title transition-colors hover:bg-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <Tooltip content="پیوست فایل">
          <IconButton label="پیوست فایل" icon={<PaperclipIcon size={20} />} size="sm" />
        </Tooltip>

        <label className="sr-only" htmlFor="chat-composer-input">
          {`نوشتن پیام در ${conversationTitle}`}
        </label>
        <span id="chat-composer-hint" className="sr-only">
          برای ارسال، کلید Enter و برای رفتن به خط جدید، Shift به همراه Enter را بزنید.
        </span>
        <textarea
          id="chat-composer-input"
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            resize(event.target);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="پیام خود را بنویسید…"
          aria-describedby="chat-composer-hint"
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-body-sm leading-6 text-fg-primary outline-none placeholder:text-fg-placeholder"
        />

        <Tooltip content="ضبط پیام صوتی">
          <IconButton label="ضبط پیام صوتی" icon={<MicrophoneIcon size={20} />} size="sm" />
        </Tooltip>

        <IconButton
          label="ارسال پیام"
          icon={<SendIcon size={20} />}
          size="sm"
          variant="primary"
          onClick={submit}
          disabled={draft.trim().length === 0}
          className={cn(draft.trim().length === 0 && 'opacity-50')}
        />
      </div>
    </div>
  );
}
