import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DEFAULT_PERMISSION_MATRIX, PERMISSION_ACTIONS, PERMISSION_MODULES, ROLES } from '@/data/reference';
import { PermissionMatrixTable } from '@/features/workspace/components/roles/PermissionMatrixTable';

describe('PermissionMatrixTable', () => {
  const adminRole = ROLES.find((r) => r.id === 'admin')!;
  const ownerRole = ROLES.find((r) => r.id === 'owner')!;

  it('contains exactly 5 modules and 5 actions totaling 25 permissions', () => {
    expect(PERMISSION_MODULES.length).toBe(5);
    expect(PERMISSION_ACTIONS.length).toBe(5);
    expect(PERMISSION_MODULES.length * PERMISSION_ACTIONS.length).toBe(25);
  });

  it('renders both desktop table (hidden md:block) and mobile accordion (md:hidden)', () => {
    const html = renderToString(
      React.createElement(PermissionMatrixTable, {
        role: adminRole,
        permissions: DEFAULT_PERMISSION_MATRIX,
        onToggle: vi.fn(),
        onToggleModule: vi.fn(),
        onToggleAction: vi.fn(),
        onToggleRole: vi.fn(),
      })
    );

    // Desktop table container with horizontal scrollable region
    expect(html).toContain('hidden md:block');
    expect(html).toContain('جدول دسترسی‌ها');

    // Mobile accordion container with card layout
    expect(html).toContain('md:hidden');
    expect(html).toContain('ماتریس دسترسی‌ها در نمای کارتی موبایل');

    // All 5 module names rendered
    for (const mod of PERMISSION_MODULES) {
      expect(html).toContain(mod.name);
    }

    // Default expanded first module (messages) renders its action rows in the accordion
    expect(html).toContain('مشاهده و خواندن اطلاعات');
    expect(html).toContain('ایجاد و ثبت رکورد جدید');
  });

  it('renders locked indicators and disabled switches for locked owner role', () => {
    const html = renderToString(
      React.createElement(PermissionMatrixTable, {
        role: ownerRole,
        permissions: DEFAULT_PERMISSION_MATRIX,
        onToggle: vi.fn(),
        onToggleModule: vi.fn(),
        onToggleAction: vi.fn(),
        onToggleRole: vi.fn(),
      })
    );

    expect(html).toContain('غیرقابل تغییر');
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain('disabled=""');
  });
});
