import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ visible: false, props: {} as Record<string, unknown> }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [
    state.visible,
    (next: (value: boolean) => boolean) => {
      state.visible = next(state.visible);
    },
  ],
}));
vi.mock('@/components/ui/Input', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/Input')>();
  return {
    ...actual,
    Input: (props: Record<string, unknown>) => {
      state.props = props;
      return createElement(actual.Input, props);
    },
  };
});
import { PasswordInput } from '@/components/ui/PasswordInput';
beforeEach(() => {
  state.visible = false;
});
it('uses an LTR control for both logical positioning and password padding, retaining RTL labels', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordInput, {
      id: 'secret',
      label: 'رمز مدیر',
      value: 'test-only',
      onChange: () => {},
      error: 'رمز را بررسی کنید.',
      autoComplete: 'current-password',
    }),
  );
  expect(html).toContain('dir="ltr" class="relative');
  expect(html).toContain('pe-16');
  expect(html).toContain('type="password"');
  expect(html).toContain('for="secret"');
  expect(html).toContain('aria-describedby="secret-error"');
  expect(html).toContain('aria-pressed="false"');
  expect(html).not.toContain('tabindex="-1"');
  expect(html).toContain('autoComplete="current-password"');
});
it('toggles without submitting, preserves mouse focus and remains keyboard reachable', () => {
  const render = () => renderToStaticMarkup(createElement(PasswordInput, { label: 'رمز عبور جدید' }));
  render();
  const button = state.props.iconEnd as ReactElement<{
    type: string;
    onMouseDown: (event: { preventDefault: () => void }) => void;
    onClick: () => void;
  }>;
  expect(button.props.type).toBe('button');
  const preventDefault = vi.fn();
  button.props.onMouseDown({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  button.props.onClick();
  expect(render()).toContain('type="text"');
  expect(render()).toContain('aria-pressed="true"');
  (state.props.iconEnd as typeof button).props.onClick();
  expect(render()).toContain('type="password"');
});
it('disables the input and visibility control together', () => {
  const html = renderToStaticMarkup(createElement(PasswordInput, { label: 'رمز مدیر', disabled: true }));
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
