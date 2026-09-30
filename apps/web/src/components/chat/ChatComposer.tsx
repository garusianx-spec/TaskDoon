'use client';

import { useRef, useState } from 'react';
import { toPersianDigits } from '@taskin/jalali';
import { cn } from '@/lib/cn';
import { type Recorded, useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { IconButton, Tooltip } from '@/components/ui';
import { ClockIcon, CloseIcon, EmojiIcon, MicrophoneIcon, PaperclipIcon, SendIcon } from '@/components/icons';
import { ScheduleMessageDialog } from './ScheduleMessageDialog';

export interface ChatComposerProps {
  readonly onSend: (text: string) => void;
  readonly replyPreview: { readonly authorName: string; readonly preview: string } | null;
  readonly onCancelReply: () => void;
  readonly conversationTitle: string;
  /** The draft became non-empty (`true`, repeated while typing) or empty again (`false`). */
  readonly onTyping?: (active: boolean) => void;
  /** Files picked with the paperclip: they wait in the preview, then go one message each. */
  readonly onAttach?: (files: readonly File[]) => void;
  /** A voice note recorded with the microphone button. */
  readonly onVoice?: (recording: Recorded) => void;
  /**
   * «زمان‌بندی ارسال» (Phase 3.2): the draft goes out at `at` instead of now. Offered by the clock
   * button beside «ارسال پیام», and by right-clicking (or long-pressing) «ارسال پیام» itself.
   */
  readonly onSchedule?: (text: string, at: Date) => void;
}

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const EMOJI_PALETTE = ['👍', '🙏', '🔥', '✅', '👀', '🎉', '❤️', '😀', '🤝', '⚡️'] as const;

/**
 * Message composer. Enter sends, Shift+Enter inserts a newline, and the textarea grows with
 * the content up to six lines before scrolling.
 */
export function ChatComposer({ onSend, replyPreview, onCancelReply, conversationTitle, onTyping, onAttach, onVoice, onSchedule }: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorder = useVoiceRecorder();
  const recording = recorder.state.phase === 'recording' ? recorder.state : null;

  const pickFiles = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length === 0 || !onAttach) return;
    const tooBig = files.filter((file) => file.size > MAX_FILE_BYTES);
    setFileError(tooBig.length > 0 ? `حجم هر فایل باید کمتر از ${toPersianDigits(100)} مگابایت باشد.` : null);
    const accepted = files.filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES);
    if (accepted.length > 0) onAttach(accepted);
  };

  const finishRecording = async () => {
    const recorded = await recorder.stop();
    if (recorded && onVoice) onVoice(recorded);
    else if (!recorded) setFileError('پیام صوتی باید دست‌کم یک ثانیه باشد.');
  };

  const resize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
  };

  const clear = () => {
    setDraft('');
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      element.focus();
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    clear();
  };

  const openScheduler = () => {
    if (onSchedule && draft.trim()) setScheduling(true);
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
          <IconButton label="پیوست فایل" icon={<PaperclipIcon size={20} />} size="sm" onClick={() => fileRef.current?.click()} disabled={recording !== null} />
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="انتخاب فایل برای پیوست"
          data-testid="chat-file-input"
          onChange={(event) => {
            pickFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <label className="sr-only" htmlFor="chat-composer-input">
          {`نوشتن پیام در ${conversationTitle}`}
        </label>
        <span id="chat-composer-hint" className="sr-only">
          برای ارسال، کلید Enter و برای رفتن به خط جدید، Shift به همراه Enter را بزنید.
        </span>
        {recording && (
          <div role="status" aria-live="polite" className="flex min-h-9 flex-1 items-center gap-2 px-1 text-body-sm text-fg-secondary">
            <span className="size-2.5 animate-pulse rounded-full bg-status-blocked" aria-hidden="true" />
            <span className="numeric font-medium">{`در حال ضبط ${toPersianDigits(Math.floor(recording.seconds / 60))}:${toPersianDigits(String(recording.seconds % 60).padStart(2, '0'))}`}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand-solid transition-[width] duration-75" style={{ width: `${Math.min(100, Math.round(recording.level * 300))}%` }} />
            </span>
            <IconButton label="لغو ضبط" icon={<CloseIcon size={18} />} size="xs" onClick={recorder.cancel} />
          </div>
        )}
        <textarea
          hidden={recording !== null}
          id="chat-composer-input"
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            resize(event.target);
            onTyping?.(event.target.value.trim().length > 0);
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

        {!recording && (
          <Tooltip content="ضبط پیام صوتی">
            <IconButton
              label="ضبط پیام صوتی"
              icon={<MicrophoneIcon size={20} />}
              size="sm"
              onClick={() => {
                setFileError(null);
                if (onVoice) void recorder.start();
              }}
            />
          </Tooltip>
        )}

        {!recording && onSchedule && (
          <Tooltip content="زمان‌بندی ارسال">
            <IconButton
              label="زمان‌بندی ارسال"
              icon={<ClockIcon size={20} />}
              size="sm"
              aria-haspopup="dialog"
              onClick={openScheduler}
              disabled={draft.trim().length === 0}
              className={cn(draft.trim().length === 0 && 'opacity-50')}
            />
          </Tooltip>
        )}

        {recording ? (
          <IconButton label="ارسال پیام صوتی" icon={<SendIcon size={20} />} size="sm" variant="primary" onClick={() => void finishRecording()} />
        ) : (
          <IconButton
            label="ارسال پیام"
            icon={<SendIcon size={20} />}
            size="sm"
            variant="primary"
            onClick={submit}
            // Right-click, or a long press on touch screens: send it later instead.
            onContextMenu={(event) => {
              if (!onSchedule || !draft.trim()) return;
              event.preventDefault();
              openScheduler();
            }}
            disabled={draft.trim().length === 0}
            className={cn(draft.trim().length === 0 && 'opacity-50')}
          />
        )}
      </div>
      {onSchedule && (
        <ScheduleMessageDialog
          open={scheduling}
          text={draft.trim()}
          onClose={() => setScheduling(false)}
          onConfirm={(at) => {
            const text = draft.trim();
            setScheduling(false);
            if (!text) return;
            onSchedule(text, at);
            clear();
          }}
        />
      )}
      {(fileError || recorder.state.phase === 'error') && (
        <p role="alert" className="mt-1.5 px-1 text-caption text-status-blocked">
          {recorder.state.phase === 'error' ? recorder.state.message : fileError}
        </p>
      )}
    </div>
  );
}
