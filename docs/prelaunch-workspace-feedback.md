# Workspace feedback audit

Branch: `fix/prelaunch-critical-audit`. Starting HEAD: `2b7784a`.
All browser records in this audit are synthetic, in-memory demo records. Persistence failures
use existing LiveStore fixtures with mocked API methods. No staging account, production
account, existing user task, note or attachment was accessed or changed.

## Review groups and confirmed paths

1. **Task draft dismissal.** The historical creation hook closes whenever it is not submitting;
   the historical AppShell closes the inspector whenever it is not busy. Both paths discard
   staged fields on Escape. The ignored local reproducer temporarily loaded those two HEAD
   versions, reproduced both losses in Chromium, and restored the candidate source in a
   finally block. Log: `.local/audit-drafts-reproduction.log`.
   Creation compares against its seeded form and includes selected files in dirty detection.
   Details compare staged fields/column against the persisted task. Escape, backdrop, close
   and Cancel use the same guard. Untouched/reverted drafts close directly. A visible Persian
   warning offers continued editing or explicit discard. Successful save bypasses the guard;
   failure retains the form and existing inline errors. Message/comment/subtask/file handlers
   retain their existing immediate persistence semantics.
2. **Task action feedback.** Edit success uses the existing workspace operation toast after
   awaited persistence. Live completion and board placement use existing LiveStore notices
   only after a successful API response. Demo completion/move uses its existing toast renderer
   after a state change. Existing failure/refresh handling is preserved.
3. **Notes.** Save already persisted then opened a fresh editor; the action is now explicitly
   labelled «ذخیره و ایجاد یادداشت دیگر». A note with a task reference cannot open another
   conversion form; it retains its reference and displays an already-converted message.
   The API's existing conversion response also produces that notice when it reports
   `existing`. Existing idempotency and authorization contracts are unchanged.
   `splitForTask` already converts unchecked items into subtasks and keeps completed items
   in the description; UI copy now explains that distinction. Note deletion already uses
   acknowledged operations with Persian success/error feedback, so its runtime path was
   retained and tested with an API double, including failure followed by successful retry.

## Verification

- 38 tests pass in four web files: `task-form-persistence.test.ts`,
  `profile-notes-persistence.test.ts`, `profile-notes-components.test.ts`,
  `confirmed-operations.test.ts`. Includes failed saves/uploads/moves, confirmed completion
  versus failure, repeated conversion, and note removal using an API double.
- Text workspace: 7 tests pass.
- Web typecheck passes. Targeted source lint: zero errors, five warnings in existing
  memoization/ref code in AppShell, useNotesScreen and WorkspaceProvider. No lint rules
  were relaxed. Formatting and `git diff --check` pass.
- Four focused Chromium suites run against local demo mode: `task-draft-guard` (11 checks),
  `note-conversion-feedback` (4), `task-forms` (25), `profile-nav-notes` (31).
  All 71 functional checks passed. The combined run reported one Next development CSS preload
  timing warning in profile-nav-notes; its unchanged console policy correctly failed that
  process. Repeating that affected suite passed 31 checks with zero console problems.
  No warning exceptions or suppression were added.
- The original three-suite packaging also passed all 71 checks without console problems;
  the draft and conversion cases were then split into separate files for review.

Logs are ignored under `.local/audit-drafts-*`. These are focused local regression results,
not remote CI, production-browser or exhaustive application certification. The full suite
was not rerun. `apps/web/AGENTS.md` remains untracked and excluded.
