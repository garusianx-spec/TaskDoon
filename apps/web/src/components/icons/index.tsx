/**
 * Iconsax-flavoured icon set — hand-authored on a 24×24 grid with a uniform 1.5 stroke,
 * round caps and round joins. Every glyph inherits `currentColor`, so icons theme themselves.
 *
 * Nothing here is imported from a package: shipping ~60 inlined paths keeps the icon layer
 * tree-shakeable and removes a runtime dependency from the critical path.
 */
import type { AttachmentKind } from '@taskin/contracts';
import { createIcon, type IconProps } from './createIcon';
import { cn } from '@/lib/cn';

export type { IconProps, IconVariant } from './createIcon';

/* ------------------------------- Navigation ------------------------------- */

export const HomeIcon = createIcon('HomeIcon', {
  primary: ['M3.5 9.5 12 3l8.5 6.5V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V9.5Z'],
  secondary: ['M9.5 21v-5.5a2.5 2.5 0 0 1 5 0V21'],
});

export const MessagesIcon = createIcon('MessagesIcon', {
  primary: [
    'M21 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 21 11.5Z',
  ],
  secondary: ['M9 10.5h6', 'M9 14h3.5'],
});

export const TaskSquareIcon = createIcon('TaskSquareIcon', {
  primary: ['M3.5 6.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11Z'],
  secondary: ['m8 11 2 2 4-4.5', 'M8 16.5h8'],
});

export const CalendarIcon = createIcon('CalendarIcon', {
  primary: [
    'M3.5 8.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-9Z',
    'M8 3.5v4M16 3.5v4',
  ],
  secondary: ['M3.5 10.5h17', 'M8 14.5h.01M12 14.5h.01M16 14.5h.01'],
});

export const PeopleIcon = createIcon('PeopleIcon', {
  primary: [
    'M9.5 11a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z',
    'M3 20.5c0-3.2 2.9-5.5 6.5-5.5s6.5 2.3 6.5 5.5',
  ],
  secondary: ['M16.5 11.2a3 3 0 0 0 0-6', 'M18 14.6c2 .5 3 1.9 3 3.9'],
});

export const SettingsIcon = createIcon('SettingsIcon', {
  primary: [
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z',
    'M19.6 14.4a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z',
  ],
});

export const NotificationIcon = createIcon('NotificationIcon', {
  primary: [
    'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z',
    'M13.7 19a2 2 0 0 1-3.4 0',
  ],
});

export const DirectoryIcon = createIcon('DirectoryIcon', {
  primary: ['M5 4.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15Z'],
  secondary: ['M12 11.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z', 'M8.5 17c0-1.8 1.6-3 3.5-3s3.5 1.2 3.5 3', 'M2.5 7.5h2.5M2.5 12h2.5M2.5 16.5h2.5'],
});

/* ------------------------------- Actions ------------------------------- */

export const AddIcon = createIcon('AddIcon', { primary: ['M12 5v14M5 12h14'] });
export const CloseIcon = createIcon('CloseIcon', { primary: ['m6 6 12 12M18 6 6 18'] });
export const CheckIcon = createIcon('CheckIcon', { primary: ['m4.5 12.5 5 5 10-11'] });
export const MinusIcon = createIcon('MinusIcon', { primary: ['M5 12h14'] });

export const SearchIcon = createIcon('SearchIcon', {
  primary: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm20.5 20.5-3.8-3.8'],
});

export const FilterIcon = createIcon('FilterIcon', {
  primary: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
});

export const SortIcon = createIcon('SortIcon', {
  primary: ['M7 4v16', 'm3.5 16.5 3.5 3.5 3.5-3.5'],
  secondary: ['M17 20V4', 'm13.5 7.5 3.5-3.5 3.5 3.5'],
});

export const MoreHorizontalIcon = createIcon('MoreHorizontalIcon', {
  primary: ['M5.5 12h.01', 'M12 12h.01', 'M18.5 12h.01'],
});

export const MoreVerticalIcon = createIcon('MoreVerticalIcon', {
  primary: ['M12 5.5v.01', 'M12 12v.01', 'M12 18.5v.01'],
});

export const EditIcon = createIcon('EditIcon', {
  primary: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z'],
  secondary: ['m14.5 5.5 4 4'],
});

export const TrashIcon = createIcon('TrashIcon', {
  primary: ['M4.5 6.5h15', 'M8.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v1.5', 'M6.5 6.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.5'],
  secondary: ['M10.5 10.5v6M13.5 10.5v6'],
});

export const CopyIcon = createIcon('CopyIcon', {
  primary: ['M9 9a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V9Z'],
  secondary: ['M15 7V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1'],
});

export const LinkIcon = createIcon('LinkIcon', {
  primary: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7'],
  secondary: ['M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7L12.5 17'],
});

export const RefreshIcon = createIcon('RefreshIcon', {
  primary: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20.5 4v4.5H16'],
});

export const DownloadIcon = createIcon('DownloadIcon', {
  primary: ['M12 3.5v11', 'm7.5 10.5 4.5 4.5 4.5-4.5'],
  secondary: ['M4.5 17v1.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V17'],
});

/* ------------------------------- Direction ------------------------------- */

export const ChevronDownIcon = createIcon('ChevronDownIcon', { primary: ['m6 9.5 6 6 6-6'] });
export const ChevronUpIcon = createIcon('ChevronUpIcon', { primary: ['m6 14.5 6-6 6 6'] });
export const ChevronLeftIcon = createIcon('ChevronLeftIcon', { primary: ['m14.5 6-6 6 6 6'] });
export const ChevronRightIcon = createIcon('ChevronRightIcon', { primary: ['m9.5 6 6 6-6 6'] });
export const ArrowLeftIcon = createIcon('ArrowLeftIcon', {
  primary: ['M20 12H4', 'm10 6-6 6 6 6'],
});
export const ArrowRightIcon = createIcon('ArrowRightIcon', {
  primary: ['M4 12h16', 'm14 6 6 6-6 6'],
});
export const ArrowUpIcon = createIcon('ArrowUpIcon', { primary: ['M12 20V4', 'm6 10 6-6 6 6'] });
export const ArrowDownIcon = createIcon('ArrowDownIcon', { primary: ['M12 4v16', 'm6 14 6 6 6-6'] });

/**
 * Direction-aware chevrons. `Forward` always points along the reading direction and
 * `Backward` against it, so callers never branch on `dir` themselves.
 */
export function ChevronForwardIcon({ className, ...props }: IconProps) {
  return <ChevronRightIcon className={cn('rtl:-scale-x-100', className)} {...props} />;
}
export function ChevronBackwardIcon({ className, ...props }: IconProps) {
  return <ChevronLeftIcon className={cn('rtl:-scale-x-100', className)} {...props} />;
}
export function ArrowForwardIcon({ className, ...props }: IconProps) {
  return <ArrowRightIcon className={cn('rtl:-scale-x-100', className)} {...props} />;
}
export function ArrowBackwardIcon({ className, ...props }: IconProps) {
  return <ArrowLeftIcon className={cn('rtl:-scale-x-100', className)} {...props} />;
}

/* ------------------------------- Chat ------------------------------- */

export const SendIcon = createIcon('SendIcon', {
  primary: ['M20.5 3.5 3.5 10.2l6.8 2.9 2.9 6.9 7.3-16.5Z'],
  secondary: ['m10.3 13.1 3.6-3.6'],
});

export const MicrophoneIcon = createIcon('MicrophoneIcon', {
  primary: ['M12 3.5a2.8 2.8 0 0 1 2.8 2.8v5a2.8 2.8 0 1 1-5.6 0v-5A2.8 2.8 0 0 1 12 3.5Z'],
  secondary: ['M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5v3'],
});

export const PlayIcon = createIcon('PlayIcon', {
  primary: ['M8 5.7c0-1 1-1.5 1.8-1l8.1 5.4a1.2 1.2 0 0 1 0 2L9.8 19.3A1.2 1.2 0 0 1 8 18.3V5.7Z'],
});

export const PauseIcon = createIcon('PauseIcon', {
  primary: ['M9 4.5v15M15 4.5v15'],
});

export const PaperclipIcon = createIcon('PaperclipIcon', {
  primary: ['M19 11.5 12.3 18.2a4.3 4.3 0 0 1-6-6l7.5-7.5a2.9 2.9 0 0 1 4 4l-7.4 7.5a1.4 1.4 0 0 1-2-2l6.6-6.6'],
});

export const EmojiIcon = createIcon('EmojiIcon', {
  primary: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  secondary: ['M8.5 14.5a4.5 4.5 0 0 0 7 0', 'M9 9.5h.01M15 9.5h.01'],
});

export const ReplyIcon = createIcon('ReplyIcon', {
  primary: ['m9 5-5 5 5 5', 'M4 10h9a7 7 0 0 1 7 7v2'],
});

export const PinIcon = createIcon('PinIcon', {
  primary: ['M14.5 3.5 20.5 9.5', 'M17.5 6.5 15 9a5 5 0 0 0-3.5 1.2l-2.4 2.4 3.3 3.3 2.4-2.4A5 5 0 0 0 15 9'],
  secondary: ['m9.1 12.6-5.6 5.6', 'M6.4 9.9 14.1 17.6'],
});

export const MuteIcon = createIcon('MuteIcon', {
  primary: ['M12 5.5 7.5 9H4.5v6h3l4.5 3.5v-13Z', 'm16 9.5 4 5M20 9.5l-4 5'],
});

export const ConvertToTaskIcon = createIcon('ConvertToTaskIcon', {
  primary: ['M4 6.5a2.5 2.5 0 0 1 2.5-2.5H12', 'm8.5 11 2.2 2.2L15 8.5'],
  secondary: ['M20 12v5.5a2.5 2.5 0 0 1-2.5 2.5H6.5', 'm17.5 4 2.5 2.5-2.5 2.5', 'm6.5 20-2.5-2.5L6.5 15'],
});

export const DoubleCheckIcon = createIcon('DoubleCheckIcon', {
  primary: ['m2.5 12.5 3.5 3.5 7-8'],
  secondary: ['m11 16 1 1 8-9'],
});

/* ------------------------------- Tasks ------------------------------- */

export const KanbanIcon = createIcon('KanbanIcon', {
  primary: ['M3.5 5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-6Z'],
  secondary: ['M13.5 5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-11Z'],
});

export const ListIcon = createIcon('ListIcon', {
  primary: ['M9 6h11', 'M9 12h11', 'M9 18h11'],
  secondary: ['M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
});

export const GanttIcon = createIcon('GanttIcon', {
  primary: ['M4 6.5h9', 'M7.5 12h10', 'M4 17.5h6.5'],
  secondary: ['M3.5 3v18'],
});

export const FlagIcon = createIcon('FlagIcon', {
  primary: ['M5.5 21V4.5', 'M5.5 5.5h11l-2 3.5 2 3.5h-11'],
});

export const ClockIcon = createIcon('ClockIcon', {
  primary: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  secondary: ['M12 7.5V12l3 1.8'],
});

export const TimerIcon = createIcon('TimerIcon', {
  primary: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M9.5 2.5h5'],
  secondary: ['M12 9v4h3'],
});

export const StarIcon = createIcon('StarIcon', {
  primary: ['m12 3.8 2.6 5.2 5.8.9-4.2 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.2-4 5.8-.9L12 3.8Z'],
});

export function StarFilledIcon({ className, ...props }: IconProps) {
  return (
    <StarIcon
      className={cn('[&_path]:fill-current', className)}
      {...props}
    />
  );
}

export const FolderIcon = createIcon('FolderIcon', {
  primary: ['M3.5 7a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.5.7l1.1 1.3h7.2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z'],
});

export const HashIcon = createIcon('HashIcon', {
  primary: ['M9.5 3.5 7.5 20.5', 'M16.5 3.5l-2 17'],
  secondary: ['M4 8.5h16', 'M3.5 15.5h16'],
});

export const DragHandleIcon = createIcon('DragHandleIcon', {
  primary: ['M9 6h.01M9 12h.01M9 18h.01', 'M15 6h.01M15 12h.01M15 18h.01'],
});

export const SubtaskIcon = createIcon('SubtaskIcon', {
  primary: ['M4.5 4.5h7', 'M4.5 4.5v9a3 3 0 0 0 3 3h3'],
  secondary: ['M13 14.5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2v-3Z'],
});

/* ------------------------------- Files ------------------------------- */

export const DocumentIcon = createIcon('DocumentIcon', {
  primary: ['M5.5 4.5a2 2 0 0 1 2-2h5.6L19 8.4V19.5a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2v-15Z'],
  secondary: ['M13 2.5v4a2 2 0 0 0 2 2h4', 'M9 13.5h6M9 17h4'],
});

export const ImageIcon = createIcon('ImageIcon', {
  primary: ['M3.5 6.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11Z'],
  secondary: ['M8.5 11a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z', 'm4 17 4.5-4.5 4 3.5 3-2.5 5 4'],
});

export const ArchiveIcon = createIcon('ArchiveIcon', {
  primary: ['M3.5 6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6Z'],
  secondary: ['M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5', 'M10 12.5h4'],
});

export const SheetIcon = createIcon('SheetIcon', {
  primary: ['M3.5 6.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11Z'],
  secondary: ['M3.5 10h17', 'M9.5 10v10.5', 'M3.5 15h17'],
});

/* ------------------------------- Status ------------------------------- */

export const CheckCircleIcon = createIcon('CheckCircleIcon', {
  primary: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  secondary: ['m8.5 12.2 2.4 2.4 4.6-5.2'],
});

export const CloseCircleIcon = createIcon('CloseCircleIcon', {
  primary: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  secondary: ['m9.5 9.5 5 5M14.5 9.5l-5 5'],
});

export const InfoCircleIcon = createIcon('InfoCircleIcon', {
  primary: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  secondary: ['M12 11v5', 'M12 8h.01'],
});

export const WarningIcon = createIcon('WarningIcon', {
  primary: ['M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z'],
  secondary: ['M12 9.5v4', 'M12 16.8h.01'],
});

export const DotIcon = createIcon('DotIcon', {
  primary: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
});

/* ------------------------------- Theme ------------------------------- */

export const SunIcon = createIcon('SunIcon', {
  primary: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z'],
  secondary: ['M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2', 'm5.3 5.3 1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4'],
});

export const MoonIcon = createIcon('MoonIcon', {
  primary: ['M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z'],
});

export const MonitorIcon = createIcon('MonitorIcon', {
  primary: ['M3.5 6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6Z'],
  secondary: ['M9 20h6', 'M12 16v4'],
});

export const PaletteIcon = createIcon('PaletteIcon', {
  primary: ['M12 21a9 9 0 1 1 9-9c0 1.7-1.4 2.6-3 2.6h-1.6a2 2 0 0 0-1.5 3.3c.5.6.1 3.1-1.9 3.1Z'],
  secondary: ['M7.5 12h.01M9.8 8.4h.01M14.2 8.4h.01M16.5 12h.01'],
});

/* ------------------------------- Identity ------------------------------- */

export const UserIcon = createIcon('UserIcon', {
  primary: ['M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20.5c0-3.4 3.4-6 7.5-6s7.5 2.6 7.5 6'],
});

export const UserAddIcon = createIcon('UserAddIcon', {
  primary: ['M10 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M2.5 20.5c0-3.4 3.4-6 7.5-6 1.3 0 2.5.2 3.6.7'],
  secondary: ['M18 14.5v6M15 17.5h6'],
});

export const CrownIcon = createIcon('CrownIcon', {
  primary: ['M4 18h16', 'M4.5 7.5 8 11l4-6 4 6 3.5-3.5-1.3 8H5.8L4.5 7.5Z'],
});

export const ShieldIcon = createIcon('ShieldIcon', {
  primary: ['M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z'],
  secondary: ['m9 12 2.2 2.2L15.5 10'],
});

export const KeyIcon = createIcon('KeyIcon', {
  primary: ['M15.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'],
  secondary: ['m13 9.5-9.5 9.5v2h2l.5-2h2l.5-2h2v-2l2.5-2.5'],
});

export const BriefcaseIcon = createIcon('BriefcaseIcon', {
  primary: ['M3.5 9a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V9Z'],
  secondary: ['M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7', 'M3.5 12.5h17'],
});

export const LogoutIcon = createIcon('LogoutIcon', {
  primary: ['M9 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H9'],
  secondary: ['M13 8.5 16.5 12 13 15.5', 'M16.5 12H8'],
});

export const LockIcon = createIcon('LockIcon', {
  primary: ['M5.5 11.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7Z'],
  secondary: ['M8 9.5V7.5a4 4 0 1 1 8 0v2', 'M12 14v3'],
});

export const EyeIcon = createIcon('EyeIcon', {
  primary: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z'],
  secondary: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
});

export const SidebarIcon = createIcon('SidebarIcon', {
  primary: ['M3.5 6.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11Z'],
  secondary: ['M14.5 3.5v17'],
});

export const GridIcon = createIcon('GridIcon', {
  primary: ['M4 5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 10 5.5v3A1.5 1.5 0 0 1 8.5 10h-3A1.5 1.5 0 0 1 4 8.5v-3Z', 'M14 5.5A1.5 1.5 0 0 1 15.5 4h3A1.5 1.5 0 0 1 20 5.5v3A1.5 1.5 0 0 1 18.5 10h-3A1.5 1.5 0 0 1 14 8.5v-3Z'],
  secondary: ['M4 15.5A1.5 1.5 0 0 1 5.5 14h3A1.5 1.5 0 0 1 10 15.5v3A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3Z', 'M14 15.5a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z'],
});

export const ChartIcon = createIcon('ChartIcon', {
  primary: ['M3.5 20.5h17'],
  secondary: ['M7 20.5v-6M12 20.5V7M17 20.5v-9'],
});

export const SmsIcon = createIcon('SmsIcon', {
  primary: ['M3.5 7.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-9Z'],
  secondary: ['m4.5 7 6.4 4.6a2 2 0 0 0 2.2 0L19.5 7'],
});

export const CallIcon = createIcon('CallIcon', {
  primary: ['M21 17.2v2.3a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3 5.2 1.8 1.8 0 0 1 4.8 3.2h2.3a1.8 1.8 0 0 1 1.8 1.6c.1.9.3 1.7.7 2.5a1.8 1.8 0 0 1-.4 2l-1 1a14 14 0 0 0 5.4 5.4l1-1a1.8 1.8 0 0 1 2-.4c.8.3 1.6.6 2.5.7a1.8 1.8 0 0 1 1.6 1.8Z'],
});

/* ------------------------------- Notes & editor ------------------------------- */

export const NotebookIcon = createIcon('NotebookIcon', {
  primary: ['M6.5 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a1.5 1.5 0 0 1-1.5-1.5v-14a1.5 1.5 0 0 1 1.5-1.5Z', 'M9 3.5v17'],
  secondary: ['M12 8h4.5M12 11.5h4.5', 'M3.5 7.5H5M3.5 12H5M3.5 16.5H5'],
});

export const HeadingIcon = createIcon('HeadingIcon', {
  primary: ['M6 5v14', 'M18 5v14', 'M6 12h12'],
});

export const BoldIcon = createIcon('BoldIcon', {
  primary: ['M7 5h6a3.5 3.5 0 0 1 0 7H7V5Z', 'M7 12h7a3.5 3.5 0 0 1 0 7H7v-7Z'],
});

export const ItalicIcon = createIcon('ItalicIcon', {
  primary: ['M10 5h8', 'M6 19h8', 'm14.5 5-5 14'],
});

export const ChecklistIcon = createIcon('ChecklistIcon', {
  primary: ['M11.5 7h8.5', 'M11.5 17h8.5'],
  secondary: ['m3.5 6.5 1.8 1.8L8.5 5', 'M4 15.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5Z'],
});

/* ------------------------------- Calendar & account ------------------------------- */

export const MilestoneIcon = createIcon('MilestoneIcon', {
  primary: ['M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z'],
  secondary: ['M12 8.5 15.5 12 12 15.5 8.5 12 12 8.5Z'],
});

export const MobileIcon = createIcon('MobileIcon', {
  primary: ['M7 4.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-15Z'],
  secondary: ['M11 18h2'],
});

export const EyeSlashIcon = createIcon('EyeSlashIcon', {
  primary: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'm4 4 16 16'],
  secondary: ['M12 15a3 3 0 0 1-3-3'],
});

/* ------------------------------- Media ------------------------------- */

export const VideoIcon = createIcon('VideoIcon', {
  primary: ['M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h8a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5v-9Z'],
  secondary: ['m16.5 10 4-2.5v9l-4-2.5'],
});

export const MusicIcon = createIcon('MusicIcon', {
  primary: ['M9 18V5.5l11-2V16', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  secondary: ['M9 9.5l11-2'],
});

/** One glyph per attachment kind, shared by bubbles, the task inspector and the media drawer. */
export const ATTACHMENT_ICONS = {
  image: ImageIcon,
  video: VideoIcon,
  document: DocumentIcon,
  sheet: SheetIcon,
  archive: ArchiveIcon,
  audio: MusicIcon,
  link: LinkIcon,
} as const satisfies Record<AttachmentKind, typeof ImageIcon>;

export const FolderAddIcon = createIcon('FolderAddIcon', {
  primary: ['M3.5 7a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.5.7l1.1 1.3h7.2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z'],
  secondary: ['M12 11v5.5M9.25 13.75h5.5'],
});
