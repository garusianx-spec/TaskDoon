import type { Department } from '@taskin/contracts';
import { FeatureIcon, FolderIcon, PaletteIcon } from '@/components/icons';
import { createIcon } from '@/components/icons/createIcon';
import { departmentGlyph } from '@/lib/project-form';

const TerminalIcon = createIcon('TerminalIcon', { primary: ['M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z', 'm7 9 3 3-3 3m6 0h4'] });
const MegaphoneIcon = createIcon('MegaphoneIcon', { primary: ['m14 7 6-4v18l-6-4H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h9Z', 'M14 7v10M6 17l1 5h4l-1-5'] });
const WalletIcon = createIcon('WalletIcon', { primary: ['M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6m17 7h-5v4h5', 'M16.5 15h.01'] });
const HeadphonesIcon = createIcon('HeadphonesIcon', { primary: ['M4 14v-3a8 8 0 0 1 16 0v3m0 4v1a2 2 0 0 1-2 2h-5', 'M5 11a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2Zm14 0a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2Z'] });

const GLYPHS = {
  engineering: TerminalIcon, product: FeatureIcon, design: PaletteIcon,
  marketing: MegaphoneIcon, finance: WalletIcon, operations: HeadphonesIcon, custom: FolderIcon,
};

/** UUID-backed departments still get contextual icons from their Persian or English names. */
export function DepartmentIcon({ department, size = 18 }: { readonly department: Pick<Department, 'id' | 'name'>; readonly size?: number }) {
  const Icon = GLYPHS[departmentGlyph(department.id, department.name)];
  return <Icon size={size} />;
}
