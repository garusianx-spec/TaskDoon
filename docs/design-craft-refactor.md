# Shared theme and interaction refactor — 2026-11-19

Worktree: `taskdoon-phase4-integration`, branch `fix/prelaunch-critical-audit`.
Integration baseline at inspection: `5f2813b`. Existing work was preserved.
No deployment, commit, push, credentials, API contract, or persistent data changes.

## Findings and changes

The public wrapper explicitly set light/indigo, and redeclared light tokens on
`.public-surface`. These local declarations defeated the document theme. The
wrapper now inherits the existing ThemeProvider/bootstrap preference; no second
theme store or new dependency was introduced.

| Files                                                                          | Purpose                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`                                                        | Inherit document tokens on public surfaces; OLED canvas/surface/raised/sunken and border values; six existing accent palettes retained                                    |
| `src/components/public/PublicSurface.tsx`, `public.css`                        | Remove forced light scheme and accent; semantic selection/focus colors                                                                                                    |
| `src/components/layout/ThemeToggle.tsx`                                        | Reuse existing accessible popover and picker; optional top/bottom placement with viewport collision handling                                                              |
| `src/features/marketing/components/MarketingHeader.tsx`, `marketing.css`       | Header theme picker, expanded link padding, translucent sticky header and scrolled state; logical toolbar centering                                                       |
| `src/components/layout/TopAppBar.tsx`                                          | Mobile header picker and translucent surface; desktop retains its existing NavRail picker                                                                                 |
| `src/components/ui/Button.tsx`, `IconButton.tsx`, `Checkbox.tsx`               | Shared minimum targets; preserve small checkbox glyph inside larger target; restrained pressed feedback                                                                   |
| `src/app/globals.css`                                                          | Balanced headings, readable base leading, Persian font features, semantic selection, thin themed scrollbars, color transitions; existing reduced-motion override retained |
| `src/app/layout.tsx`                                                           | Black OS-dark browser theme color                                                                                                                                         |
| `src/features/auth/components/PhoneSignInSteps.tsx`, `PasswordSignInSteps.tsx` | Persian display prefix and example number only; input normalization and submitted values unchanged                                                                        |
| `src/features/auth/components/auth.css`                                        | Semantic selected/subtle background in dark mode                                                                                                                          |
| `src/features/marketing/components/Sections.tsx`                               | Preserve subtitle wording below heading rather than as an eyebrow                                                                                                         |
| `src/features/marketing/components/homepage.css`                               | Semantic walkthrough selected state; contrast-safe closing CTA fill/text across palettes and modes                                                                        |
| `e2e/suites/design-craft.mjs`                                                  | Local-only demo browser regression, three widths, theme modes, navigation, keyboard dismissal, overflow and target checks; screenshots                                    |
| `e2e/suites/theme.mjs`                                                         | Update OLED expectation to explicitly requested black                                                                                                                     |

## Verification and limits

- `npm run build -w @taskin/web`: PASS on final product code. Next 16.4.6
  compiled and finished TypeScript. Local GET-only CMS fixture at port 4187;
  demo data source. This verifies a local production build, not production data.
- `npm run typecheck -w @taskin/web`: PASS.
- `npm run lint -w @taskin/web`: exit 0, **20 warnings**, no errors. Do not
  interpret this as a warning-free repository.
- `npm run check:contrast -w @taskin/web`: PASS, **312 pairs**, six accents ×
  two modes × 26 existing AA text/non-text pairs. This is WCAG luminance-ratio
  testing, not APCA or whole-product AAA certification.
- Targeted unit tests: **30 passed** across `ui-classes`,
  `profile-notes-components`, `mobile-navigation`, `task-form-persistence`.
- Real Chrome screenshots: widths **375, 768, 1440**, local Next development
  server at port 3165. Both `/` and `/feed`, light/dark/system (OS-light),
  reduced-motion preference enabled. Screenshots under
  `apps/web/e2e/out/craft-*-viewport.png` and matching full-page captures.
- Initial `design-craft` execution: **90 functional checks passed**, no
  failed assertions, but **two CSS preload warnings**, nonzero suite exit.
- Final product-state rerun: **113 functional checks passed, zero failed**:
  `design-craft` 90, `theme` 12, `task-draft-guard` 11. Each suite still exits
  nonzero because of the development CSS preload warning; the browser gate
  is therefore **FAIL**, not fully green.
- Production preview startup at port 3166 was rejected by the tool execution
  policy with no further reason. Browser results therefore belong to dev;
  the pre-existing Next development CSS preload warning was not suppressed.

## Remaining acceptance scope

This implements shared theme/interaction foundations, not a claim that every
screen or hidden interactive state meets the entire design brief. Shared minimum
target rules do not prove the dimensions or spacing of every inline link and
specialized control. Full AAA/APCA review, real screen-reader announcements,
native zoom, authenticated API-mode login screens and all module-specific empty,
failure and loading states remain unverified. System mode with an OS-dark change
also needs a dedicated browser check. Static product screenshots remain authentic
images; their pixels intentionally do not change theme.

No gradient-text implementation or hard offset-shadow defect was found in the
inspected shared/marketing paths. Reply quote borders and semantic blockquotes
were preserved rather than treating them as decorative card stripes. Real
product previews retain their internal UI structure and all CMS text/media.
