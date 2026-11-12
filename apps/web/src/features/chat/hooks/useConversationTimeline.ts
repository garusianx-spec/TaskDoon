'use client';

import { useEffect,useMemo,useRef,useState } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import type { Conversation,Message } from '@taskin/contracts';
import {
conversationMessages,
groupMessagesByDay,messagePreview,usersByIds
} from '@/store/selectors';

const HIGHLIGHT_MS = 2400;

export function useConversationTimeline({ conversation, messages, focusedMessageId, onFocusShown }: { readonly conversation: Conversation; readonly messages: readonly Message[]; readonly focusedMessageId: string | null; readonly onFocusShown: (() => void) | undefined }) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [inChatQuery, setInChatQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** What was on screen last render, to tell "opened a thread" from "a message arrived". */
  const rendered = useRef<{ readonly conversationId: string; readonly count: number } | null>(null);

  const thread = useMemo(
    () => conversationMessages(messages, conversation.id),
    [messages, conversation.id],
  );

  const visibleThread = useMemo(() => {
    const query = inChatQuery.trim().toLowerCase();
    if (!query) return thread;
    return thread.filter((message) => messagePreview(message).toLowerCase().includes(query));
  }, [thread, inChatQuery]);

  const groups = useMemo(() => groupMessagesByDay(visibleThread), [visibleThread]);
  const members = useMemo(() => usersByIds(conversation.memberIds), [conversation.memberIds]);

  // Layout effect, so the jump happens before paint: opening a thread lands on its newest
  // message with no visible scroll from the top. A message added to the open thread (sent
  // or received — both are appended to the tail) glides into view instead.
  useIsomorphicLayoutEffect(() => {
    const previous = rendered.current;
    rendered.current = { conversationId: conversation.id, count: thread.length };
    const container = scrollRef.current;
    if (!container) return;

    if (previous === null || previous.conversationId !== conversation.id) {
      container.scrollTop = container.scrollHeight;
    } else if (thread.length > previous.count) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation.id, thread.length]);

  // «پیام مبدأ»: once the message is in the thread, bring it to the middle and flash it.
  const focusPresent = focusedMessageId !== null && thread.some((message) => message.id === focusedMessageId);
  useEffect(() => {
    if (!focusedMessageId || !focusPresent) return;
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${focusedMessageId}"]`);
    element?.scrollIntoView({ block: 'center' });
    setHighlightedId(focusedMessageId);
    onFocusShown?.();
  }, [focusedMessageId, focusPresent, onFocusShown]);

  useEffect(() => {
    if (!highlightedId) return;
    const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  return { highlightedId, inChatQuery, setInChatQuery, searchOpen, setSearchOpen, scrollRef, bottomRef, groups, members, visibleThread };
}

export type ConversationTimelineState = ReturnType<typeof useConversationTimeline>;
