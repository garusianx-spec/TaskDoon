import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DEMO_WORKSPACE_STATE } from '../src/store/initial-state';
import { workspaceReducer } from '../src/store/workspace-reducer';
import { MessageBubble } from '../src/components/chat/MessageBubble';
import { ChatView } from '../src/components/chat/ChatView';
it('archives project companions without removing their history and keeps them archived after restoration', () => {
  const project=DEMO_WORKSPACE_STATE.projects[0]!;
  const conversation={...DEMO_WORKSPACE_STATE.conversations[0]!, id:'companion',kind:'channel' as const,projectId:project.id};
  const initial={...DEMO_WORKSPACE_STATE,conversations:[conversation]};
  const deleted=workspaceReducer(initial,{type:'delete-project',projectId:project.id});
  expect(deleted.conversations[0]?.archived).toBe(true);
  expect(deleted.messages).toBe(initial.messages);
  expect(workspaceReducer(deleted,{type:'restore-project',projectId:project.id}).conversations[0]?.archived).toBe(true);
});
it('renders a read-only archive without a message composer', () => {
  const conversation={...DEMO_WORKSPACE_STATE.conversations[0]!,archived:true};
  const html=renderToStaticMarkup(createElement(ChatView,{conversation,messages:[],currentUserId:DEMO_WORKSPACE_STATE.meId,defaultProjectId:'',onBack:()=>undefined,onSend:()=>undefined,onToggleReaction:()=>undefined,onConvertToTask:()=>undefined,onOpenTask:()=>undefined,onOpenDetails:()=>undefined}));
  expect(html).toContain('فقط خواندنی');
  expect(html).not.toContain('نوشتن پیام در');
});

it('removes mutating message actions from archived message markup', () => {
  const message = DEMO_WORKSPACE_STATE.messages.find(item => item.body.kind === 'text')!;
  const author = DEMO_WORKSPACE_STATE.users.find(item => item.id === message.authorId)!;
  const html = renderToStaticMarkup(createElement(MessageBubble, {
    readOnly: true, message, author, outgoing: false, grouped: false, repliedTo: null,
    currentUserId: DEMO_WORKSPACE_STATE.meId, onReply: () => undefined,
    onToggleReaction: () => undefined, onConvertToTask: () => undefined,
    onOpenLinkedTask: () => undefined, onLongPress: () => undefined,
  }));
  if (message.body.kind === 'text') expect(html).toContain(message.body.text);
  expect(html).not.toContain('aria-label="پاسخ به پیام"');
  expect(html).not.toContain('aria-label="اقدام‌های بیشتر"');
});
