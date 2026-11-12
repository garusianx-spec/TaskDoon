import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEPARTMENTS } from '@/data/reference';
import { USERS, CURRENT_USER_ID } from '@/data/workspace';
import { CreateProjectModal } from '@/features/board/components/CreateProjectModal';
import { DepartmentIcon } from '@/features/board/components/DepartmentIcon';

// Only replace the browser portal; the actual form, Select, Avatar and icon components render.
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement('section', null, children, footer),
}));

describe('project creation component output', () => {
  const render = () =>
    renderToStaticMarkup(
      createElement(CreateProjectModal, {
        open: true,
        projectCount: 0,
        departments: DEPARTMENTS,
        members: USERS,
        currentUserId: CURRENT_USER_ID,
        onClose: () => undefined,
        onSubmit: () => undefined,
      }),
    );

  it('renders labelled department and member selectors without a description textarea', () => {
    const html = render();
    expect(html).toContain('aria-label="دپارتمان‌های پروژه"');
    expect(html).toContain('aria-label="اعضای پروژه"');
    expect(html).toContain('aria-label="اعضای انتخاب‌شده"');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('توضیحات (اختیاری)');
    expect(html).toContain('ایجاد پروژه');
  });

  it('renders the selected color swatch with a solid fill and explicit display dimensions', () => {
    const html = render();
    expect(html).toContain('data-project-color="brand"');
    expect(html).toContain('background-color:#4f46e5');
    expect(html).toContain('inline-flex size-4 shrink-0 rounded-full');
  });

  it('renders distinct SVG geometry for all six contextual department icons', () => {
    const icons = DEPARTMENTS.map((department) =>
      renderToStaticMarkup(createElement(DepartmentIcon, { department })),
    );
    expect(new Set(icons).size).toBe(6);
    for (const icon of icons) {
      expect(icon).toContain('<svg');
      expect(icon).toContain('aria-hidden="true"');
      expect(icon).toContain('<path');
    }
  });
});
