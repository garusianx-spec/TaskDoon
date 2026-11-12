'use client';

import { DEPARTMENTS } from '@/data/reference';

import type { User } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Avatar, Badge } from '@/components/ui';

export const departmentName = (user: User): string =>
  DEPARTMENTS.find((entry) => entry.id === user.department)?.name ?? '';

interface DirectPickerProps {
  readonly people: readonly User[];
  readonly selectedId: string | null;
  readonly onSelect: (userId: string) => void;
  readonly hasExisting: (userId: string) => boolean;
}

/** Single-choice list with the ARIA radiogroup keyboard contract (arrows move and select). */
export function DirectPicker({ people, selectedId, onSelect, hasExisting }: DirectPickerProps) {
  const { registerItem, onKeyDown } = useRovingFocus(people.length, 'vertical', {
    onActivate: (index) => {
      const person = people[index];
      if (person) onSelect(person.id);
    },
  });
  const selectedIndex = people.findIndex((person) => person.id === selectedId);

  return (
    <div
      role="radiogroup"
      aria-label="انتخاب همکار"
      onKeyDown={onKeyDown}
      className="flex max-h-72 flex-col gap-1.5 overflow-y-auto scrollbar-thin"
    >
      {people.map((user, index) => {
        const selected = user.id === selectedId;
        return (
          <button
            key={user.id}
            ref={registerItem(index)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onSelect(user.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-start transition-colors',
              selected ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-brand bg-brand-solid' : 'border-primary bg-surface',
              )}
            >
              {selected && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <PersonSummary user={user} />
            {hasExisting(user.id) && (
              <Badge tone="neutral" size="sm" className="ms-auto">
                گفتگوی موجود
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PersonSummary({ user }: { readonly user: User }) {
  return (
    <>
      <Avatar
        name={user.fullName}
        initials={user.initials}
        tone={user.avatarTone}
        size="sm"
        presence={user.presence}
        decorative
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-caption font-semibold text-fg-primary">{user.fullName}</span>
        <span className="truncate text-micro text-fg-tertiary">{`${user.jobTitle}، ${departmentName(user)}`}</span>
      </span>
    </>
  );
}
