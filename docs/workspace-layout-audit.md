# Workspace layout and scoping audit

Base: `04bd8e5`, branch `fix/prelaunch-critical-audit`.
Only synthetic local demo records and isolated unit fixtures were used. No existing account
data was edited. No staging endpoint or credentials were supplied; the previously used
disposable PostgreSQL port 55449 is unavailable. Consequently, this report does not claim
a real staging/database run. The role-count cause was established from rendered demo rows,
a one-active-member fixture, and the existing active-workspace hydration code.

## Before / after evidence

| Finding                             | Before                                                                                                                                                                       | After / disposition                                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile filter dismissal             | Expanded panel had no explicit return-to-results action.                                                                                                                     | Visible «نمایش نتایج» closes it and restores trigger focus; Escape inside the panel also closes it, after nested controls handle Escape first.                                                                                           |
| Active filters                      | Existing filter badges already remained visible after collapsing the panel.                                                                                                  | Preserved and browser-verified; no replacement filtering logic.                                                                                                                                                                          |
| Add task in mobile results          | Header creation button was hidden below sm; observed invisible at 375px.                                                                                                     | Visible 44px-high creation button in the task header.                                                                                                                                                                                    |
| Completion hit area                 | Actual button measured 16×16px at 375px.                                                                                                                                     | Actual mobile button is 44×44px; its painted checkbox stays 16×16px. Existing keyboard/event isolation retained.                                                                                                                         |
| Row action hit area                 | Extra-small icon button was 28×28px.                                                                                                                                         | 44×44px button with the existing 16px icon.                                                                                                                                                                                              |
| Roles: 44 versus actual members     | ROLES contains static counts 1+3+7+28+5=44. RoleList rendered these values directly, including on the live roles page.                                                       | Both role views derive counts from the current workspace directory and exclude former members. The isolated one-owner fixture totals 1, admin 0, and empty directory totals 0. Definitions, ranks and permission matrices are unchanged. |
| Department counts in advanced roles | Also read static reference counts.                                                                                                                                           | Derived from active directory members, using the same department IDs as the existing bulk-role operation.                                                                                                                                |
| Blank email action                  | Unconditional mailto link even for blank email.                                                                                                                              | No link for empty/whitespace email; valid synthetic email keeps its link. SSR fixture tests both paths.                                                                                                                                  |
| Role keyboard navigation            | ArrowDown left focus on Owner; other tabs had tabIndex -1.                                                                                                                   | Up/Down, Home and End move focus and selection without changing permissions.                                                                                                                                                             |
| Mobile permission matrix            | Wide overflow table lacked a named focusable scrolling region.                                                                                                               | Named keyboard-focusable horizontal region; existing table, switches and authorization retained.                                                                                                                                         |
| Role permission-count contrast      | Browser color rgb(152,162,179), about 2.6:1 on white.                                                                                                                        | Existing secondary-text token, measured 10.46:1 on white. Theme contrast check also passes.                                                                                                                                              |
| Done at 1280px                      | Board viewport 916px, scroll width 1600px; Done x=-428px, width 320px.                                                                                                       | Explicit keyboard-accessible «نمایش ستون انجام شد» reveals Done inside viewport, retaining fixed-width columns and existing drag/drop.                                                                                                   |
| Filtered column message             | Always said «ستون خالی است».                                                                                                                                                 | Columns with existing but filtered-out tasks explain no matches. Genuinely empty columns keep their empty-state message. Unfiltered/project counts determine the distinction.                                                            |
| Redundant note creation             | Both empty list/editor supplied additional create buttons alongside existing header/sidebar creation.                                                                        | Empty placeholders no longer add duplicate actions; existing creation entry points remain. Empty-note SSR fixture checks the mobile action remains.                                                                                      |
| Notes at 1024px                     | Editor measured 276px wide.                                                                                                                                                  | List uses 256px at lg and existing 384px at xl; editor measures 404px at 1024.                                                                                                                                                           |
| Exact message at 768px              | Task source selected m-14, but both chat main and exact message were invisible behind the list.                                                                              | Focus-message state opens and retains the mobile detail pane; exact m-14 is visible after cross-route navigation.                                                                                                                        |
| Empty archived chat                 | Prompt asked users to write the first message despite read-only mode.                                                                                                        | Prompt explicitly says the archive is read-only and cannot receive messages. Existing archive mutability tests remain.                                                                                                                   |
| Calendar edit/delete                | Backend already supports GET/PATCH/DELETE event routes with its existing permission/version checks. Frontend endpoints expose range/create, and event summaries are passive. | Discoverability gap recorded; no new calendar UI, API behavior or permissions added. Exposing editing/deletion requires product approval.                                                                                                |

The directory is populated by `api.workspaces.members(w, true)` and filtered to active members
in LiveStore hydration. This was a reference-data rendering defect, not evidence of a
cross-tenant query leak. No backend query or schema change was warranted.

## Verification and review

- 27 targeted web tests pass: directory/count fixtures, archived chat, mobile navigation
  selectors, task persistence and existing failure paths.
- Web typecheck and demo production build pass.
- Theme contrast audit passes: 6 palettes × 2 modes × 26 foreground/background pairs.
- Targeted source lint passes without errors; formatting and diff checks are included.
- New `workspace-layout-audit.mjs`: 16 passing browser checks across 375, 768, 1024 and
  1280px, including RTL bounds, real hit-area measurements, keyboard roles, grid focus,
  contrast, filtered results, Done reveal and exact-message navigation.
- Production-browser regression command runs `workspace-layout-audit mobile-navigation kanban
profile-nav-notes chat-archive`: **131 checks passed, zero failures and zero console
  problems** (16 + 53 + 17 + 31 + 14). Detailed results: `.local/layout-production-e2e.log`.
  Earlier development runs were interrupted by source hot reload and preload warnings; no
  console exceptions were added. The filter trigger retains its existing stable label.

Before screenshots/log: `.local/layout-before-*`, `.local/layout-before.log`.
After screenshots: `.local/layout-after-*`. Unit/build/contrast/lint logs:
`.local/layout-unit-final.log`, `layout-build.log`, `layout-contrast.log`,
`layout-lint.log`. Reproduction of the exact-message issue used
`.local/message-probe.mjs` (false/false before, true/true after).

Review groups: mobile task controls; role/directory presentation; board visibility and
filtered-state copy; note layout/empty states; exact-message navigation/archive copy;
cross-flow regression evidence. No push, merge, deployment or production access occurred.
The pre-existing untracked `apps/web/AGENTS.md` is preserved and excluded.
