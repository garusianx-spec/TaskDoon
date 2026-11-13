'use client';

import type { Conversation } from '@taskin/contracts';
import type { ConversationDraft } from '@/store/workspace-reducer';
import { formatCount } from '@/lib/format';
import { Badge, Button, Checkbox, Input, Modal, SegmentedControl } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormError } from '@/components/shared/FormError';
import { MessagesIcon, PeopleIcon, SearchIcon, UserIcon } from '@/components/icons';
import { DirectPicker, PersonSummary } from '@/features/chat/components/ConversationPersonPicker';
import { useNewConversationForm } from '@/features/chat/hooks/useNewConversationForm';

export interface NewConversationModalProps {
  readonly open: boolean;
  readonly currentUserId: string;
  readonly conversations: readonly Conversation[];
  readonly onClose: () => void;
  readonly onSubmit: (draft: ConversationDraft, commandId: string) => Promise<void>;
}

/**
 * Start a one-to-one conversation or a team group. A direct chat with someone you already
 * talk to reopens the existing thread instead of creating a duplicate.
 */
export function NewConversationModal({
  open,
  currentUserId,
  conversations,
  onClose,
  onSubmit,
}: NewConversationModalProps) {
  const {
    mode,
    setMode,
    query,
    setQuery,
    directId,
    setDirectId,
    memberIds,
    setMemberIds,
    groupName,
    setGroupName,
    topic,
    setTopic,
    setTouched,
    setNameTouched,
    colleagues,
    hasColleagues,
    existingDirect,
    directError,
    nameError,
    membersError,
    submit,
    selectedDirect,
    submission,
  } = useNewConversationForm({ open, currentUserId, conversations, onSubmit });
  const close = () => {
    if (!submission.isPending()) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="گفتگوی جدید"
      description="با یک همکار گفتگوی شخصی شروع کنید یا برای تیم خود گروه بسازید."
      icon={<MessagesIcon size={20} />}
      footer={
        <>
          <FormError message={submission.error} className="basis-full" />
          <Button variant="secondary" onClick={close} disabled={submission.saving}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} loading={submission.saving}>
            {submission.saving
              ? 'در حال ثبت…'
              : mode === 'direct'
                ? selectedDirect && existingDirect(selectedDirect.id)
                  ? 'باز کردن گفتگو'
                  : 'شروع گفتگو'
                : 'ایجاد گروه'}
          </Button>
        </>
      }
    >
      <fieldset
        className="flex min-w-0 flex-col gap-4"
        disabled={submission.saving}
        aria-busy={submission.saving || undefined}
      >
        <SegmentedControl
          ariaLabel="نوع گفتگو"
          size="md"
          fullWidth
          value={mode}
          onValueChange={(next) => {
            setMode(next);
            setTouched(false);
            setNameTouched(false);
            submission.clearError();
          }}
          options={[
            { value: 'direct', label: 'گفتگوی شخصی', icon: <UserIcon size={16} /> },
            { value: 'group', label: 'گروه تیمی', icon: <PeopleIcon size={16} /> },
          ]}
        />

        {mode === 'group' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="نام گروه"
              required
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              onFocus={() => setNameTouched(false)}
              onBlur={() => setNameTouched(true)}
              placeholder="مثلاً: تیم انتشار نسخه ۳"
              error={nameError}
              maxLength={60}
              data-autofocus
            />
            <Input
              label="موضوع (اختیاری)"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="هدف این گروه در یک جمله"
              maxLength={90}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-medium text-fg-secondary">
              {mode === 'direct' ? 'گفتگو با' : 'اعضای گروه'}
            </span>
            {mode === 'group' && memberIds.length > 0 && (
              <Badge tone="brand" size="sm" numeric>
                {`${formatCount(memberIds.length + 1)} نفر با شما`}
              </Badge>
            )}
          </div>

          <Input
            label="جستجوی همکار"
            hideLabel
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نام، سمت یا دپارتمان…"
            iconStart={<SearchIcon size={18} />}
            data-autofocus={mode === 'direct' ? '' : undefined}
          />

          {colleagues.length === 0 ? (
            <EmptyState
              compact
              icon={<SearchIcon size={18} />}
              title={hasColleagues ? 'همکاری پیدا نشد' : 'هنوز همکار دیگری در این فضای کاری نیست'}
              description={
                hasColleagues ? 'عبارت جستجو را تغییر دهید.' : 'از بخش همکاران، یک نفر را دعوت کنید.'
              }
            />
          ) : mode === 'direct' ? (
            <DirectPicker
              people={colleagues}
              selectedId={directId}
              onSelect={setDirectId}
              hasExisting={existingDirect}
            />
          ) : (
            <ul
              className="flex max-h-72 flex-col gap-1.5 overflow-y-auto scrollbar-thin"
              aria-label="انتخاب اعضای گروه"
            >
              {colleagues.map((user) => {
                const checked = memberIds.includes(user.id);
                return (
                  <li key={user.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-secondary px-2.5 py-2 transition-colors hover:bg-hover has-[[aria-checked=true]]:border-brand">
                      <Checkbox
                        checked={checked}
                        size="sm"
                        ariaLabel={user.fullName}
                        onCheckedChange={(next) =>
                          setMemberIds((current) =>
                            next ? [...current, user.id] : current.filter((id) => id !== user.id),
                          )
                        }
                      />
                      <PersonSummary user={user} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {(directError ?? membersError) && (
            <p className="text-caption text-status-blocked" role="alert">
              {directError ?? membersError}
            </p>
          )}
        </div>
      </fieldset>
    </Modal>
  );
}
