#!/usr/bin/env node
/**
 * WCAG contrast audit for the theme engine.
 *
 * Parses `src/styles/tokens.css`, resolves the token cascade exactly as the browser would for
 * every accent × mode (`:root` → `[data-theme='dark']` → `[data-accent]` →
 * `[data-accent='…']`, in source order), and checks each foreground/background pair the UI
 * actually paints. Text pairs need 4.5:1 (AA), non-text UI (borders, focus rings) 3:1.
 *
 *   npm run check:contrast
 *
 * Exits 1 if any pair fails, so it can gate CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule block as { selector, declarations } in source order. */
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim(),
  declarations: Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  ),
}));

const accents = [...new Set(blocks.map((b) => /^\[data-accent='(\w+)'\]$/.exec(b.selector)?.[1]).filter(Boolean))];

function tokensFor(mode, accent) {
  const applies = (selector) =>
    selector === ':root' ||
    (selector === "[data-theme='dark']" && mode === 'dark') ||
    selector === '[data-accent]' ||
    selector === `[data-accent='${accent}']`;
  const merged = {};
  for (const block of blocks) if (applies(block.selector)) Object.assign(merged, block.declarations);
  return merged;
}

function resolveRgb(tokens, name, depth = 0) {
  if (depth > 10) throw new Error(`Cycle resolving ${name}`);
  const value = tokens[name];
  if (value === undefined) throw new Error(`Unknown token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) return resolveRgb(tokens, ref[1], depth + 1);
  const channels = value.split(/\s+/).map(Number);
  if (channels.length !== 3 || channels.some(Number.isNaN)) throw new Error(`${name} is not an R G B triplet: ${value}`);
  return channels;
}

const luminance = ([r, g, b]) => {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = 4.5;
const UI = 3;

/** [foreground, background, minimum, what it is] */
const PAIRS = [
  ['--fg-on-brand', '--bg-brand-solid', TEXT, 'primary button label'],
  ['--fg-on-brand', '--bg-brand-solid-hover', TEXT, 'primary button label, hover'],
  ['--fg-brand', '--bg-surface', TEXT, 'brand text on cards'],
  ['--fg-brand', '--bg-canvas', TEXT, 'brand text on canvas'],
  ['--fg-brand', '--bg-brand-subtle', TEXT, 'selected nav / brand badge'],
  ['--fg-brand', '--bg-brand-subtle-hover', TEXT, 'tertiary button, hover'],
  ['--status-review', '--status-review-bg', TEXT, 'review status badge'],
  ['--brand-700', '--brand-100', TEXT, 'brand avatar initials'],
  ['--fg-primary', '--bg-surface', TEXT, 'body text'],
  ['--fg-secondary', '--bg-surface', TEXT, 'secondary text'],
  ['--fg-tertiary', '--bg-surface', TEXT, 'metadata text'],
  ['--fg-tertiary', '--bg-canvas', TEXT, 'metadata on canvas'],
  ['--status-done', '--status-done-bg', TEXT, 'done badge'],
  ['--status-progress', '--status-progress-bg', TEXT, 'in-progress badge'],
  ['--status-blocked', '--status-blocked-bg', TEXT, 'blocked badge'],
  ['--status-todo', '--status-todo-bg', TEXT, 'todo badge'],
  ...['gray', 'blue', 'teal', 'green', 'amber', 'red', 'pink', 'violet'].map((tone) => [
    `--tag-${tone}-fg`,
    `--tag-${tone}-bg`,
    TEXT,
    `${tone} tag badge`,
  ]),
  ['--border-brand', '--bg-surface', UI, 'selected / hovered card border'],
  ['--ring-brand', '--bg-canvas', UI, 'focus ring'],
];

let failures = 0;
for (const mode of ['light', 'dark']) {
  for (const accent of accents) {
    const tokens = tokensFor(mode, accent);
    const lines = [];
    for (const [fg, bg, min, label] of PAIRS) {
      const value = ratio(resolveRgb(tokens, fg), resolveRgb(tokens, bg));
      const ok = value >= min;
      if (!ok) failures += 1;
      lines.push(`  ${ok ? 'pass' : 'FAIL'}  ${value.toFixed(2).padStart(5)}:1  (≥${min})  ${label}  ${fg} on ${bg}`);
    }
    const failed = lines.filter((line) => line.includes('FAIL'));
    console.log(`${mode.padEnd(5)} ${accent.padEnd(7)} ${failed.length === 0 ? `all ${PAIRS.length} pairs pass` : `${failed.length} failing`}`);
    for (const line of failed) console.log(line);
    if (process.argv.includes('--verbose')) for (const line of lines) if (!line.includes('FAIL')) console.log(line);
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast failure(s).`);
  process.exit(1);
}
console.log(`\n${accents.length} palettes × 2 modes × ${PAIRS.length} pairs: WCAG AA satisfied.`);
