# Phase 1–4 CI browser regressions

Investigated on `feat/chats-archive-phase4`, 2026-10-25 (Asia/Tehran).

## GitHub Actions evidence

Run [40130312639](https://github.com/garusianx-spec/TaskDoon/actions/runs/40130312639), commit `f40b8b3e6bb226988f720be103ccc673237e9a02`:

- [Live job](https://github.com/garusianx-spec/TaskDoon/actions/runs/40130312639/job/120980433601): 16 checks passed, then the checkbox click immediately after “the task appears live on the guest’s board” timed out. There were zero browser console problems.
- [Demo job](https://github.com/garusianx-spec/TaskDoon/actions/runs/40130312639/job/120980433523): Chromium installation, web unit tests and the Next.js production build succeeded. The browser run failed in `project-creation`: mobile department-picker Escape dismissed the project form, and the following click timed out. The other 18 suites succeeded.

## Root causes and fixes

### Live task creation

Phase 1 keeps the task composer open until the task is stored, then opens its editable details dialog. The board card appears optimistically before that transition finishes. The old flow treated that visible card as readiness and immediately pressed Escape. The composer ignores closing while saving; the details dialog subsequently opens and covers the board. The completion checkbox still has its correct accessible name, but its click is intercepted by the modal.

The unchanged flow reproduced the CI failure locally: 16 passed, one timeout. Its owner screenshot showed the task-details dialog still covering the board.

The flow now waits for the composer to disappear, waits for the details dialog, verifies its editable title, explicitly closes it and waits for it to disappear. It scopes the completion checkbox to the intended card. No timeout was increased or assertion weakened.

The task-attachment section now uses the explicit **Save Changes** action before reloading. That action waits for uploads/pending edits; the previous fixed 1.5-second sleep did not establish that persistence had completed.

### Project picker Escape

The constrained popover consumed Escape inside its panel, while the parent modal listened at `document`. Autofocus moves into the popup on an animation frame. When Escape arrives with focus still on the trigger, it bypasses the panel handler, and the document listeners close both surfaces. This accounts for the faster CI browser exposing a failure that previous local runs missed.

A browser reproduction explicitly focused the open department picker’s trigger, then pressed Escape. It failed before the fix and passed afterward. The existing handler now lives on the shared trigger/panel wrapper while the constrained popup is open. It consumes Escape from either surface and retains the existing focus restoration. Closed popovers and unconstrained popovers retain their previous behavior.

The permanent demo regression checks explicitly focus the department/member triggers on mobile before pressing Escape, while retaining the assertions that the picker closes and the project draft remains open.

## Verification

| Check | Result |
|---|---|
| Unmodified live-flow reproduction | 16 passed, one timeout, zero console problems |
| Trigger-focused Escape reproduction | Failed before fix; 7 passed after fix, zero console problems |
| Workspace typecheck and lint | Passed |
| Web unit/component tests | 105 passed |
| Live production build | Passed |
| Complete `npm run test:e2e:live` | 149 passed, zero failures, zero console problems |
| Demo production build | Passed |
| Complete 19-suite demo Playwright run | 506 passed, zero failures, zero console problems |

The complete live run covered task persistence/completion after reload, guest realtime synchronization, reactions, lost-acknowledgement resend, real PDF/image upload and download, voice recording, message-to-task conversion, subtask order, task attachments, notifications, auto-replies, worker-dispatched scheduled messages, profile/notes, project departments/members, project limits, trash restoration, removal of a member and uploaded workspace icons.

Local live verification used a native API/worker process with a database migrated from zero and isolated Redis prefixes against the running PostgreSQL, Redis Core/RT and SeaweedFS services. It does not claim that the Docker images/PgBouncer topology was rebuilt locally. The remote Compose, scaled realtime and API integration jobs in the inspected run already passed.

An initial local fixture used port 3200, which SeaweedFS correctly rejected because the development storage origin is restricted to `http://localhost:3000`. The full successful run used that same port/origin as CI; the CORS policy and upload assertions were retained. Both temporary databases, their Redis keys and seven uploaded storage objects were removed after verification.

Both complete browser runs used production builds of the final source. The demo run included every suite without suite filters, assertion skips, retries or timeout increases. Verification servers were stopped after the run.

Logs are git-ignored under `.local/`: `chat-ci-live-baseline.log`, `chat-ci-popover-before.log`, `chat-ci-popover-after.log`, `chat-ci-live-ci-origin.log`, `chat-ci-live-build.log`, `chat-ci-demo-build.log` and `chat-ci-demo-full.log`. Screenshots are under `apps/web/e2e/out/`.

No backend, migration, dependency or workflow configuration changes were needed. The pre-existing `.gitignore` edits were left untouched. No commit or push was performed; a new remote CI result requires publishing the fix and rerunning Actions.
