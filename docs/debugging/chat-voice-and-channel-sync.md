# Chat voice and project-channel synchronization

Investigated on 2026-10-15 in `/home/user/taskin`, branch `fix/chat-voice-and-channel-sync`, created from freshly fetched `origin/main` at `d6c2910`. At the verification checkpoint, no commits or pushes had been made.

## Evidence and root causes

**Voice upload classification.** The browser uploads a Blob directly to S3 using a presigned POST, completes that upload through the API, then sends an attachment ID and voice metadata through WebSocket (HTTP fallback when disconnected). Binary audio does not travel in the WebSocket payload. `FilesService.complete()` sniffs the stored prefix and compares its media kind with the claim.

The old MP4 sniffing path recognized only the `M4A ` major brand as audio. An audio-only MP4 with an `isom`, `iso5`, or `mp42` brand and a valid `moov/trak/mdia/hdlr(soun)` structure was classified as `video/mp4`. A claimed `audio/mp4` therefore failed `isSpoofed()` and took the existing HTTP 422 `UPLOAD_INVALID` branch. This was reproduced against unchanged source before fixing it. AAC ADTS also matched the broad MPEG sync signature first and was mislabeled `audio/mpeg`.

`file-types.ts` now walks bounded 32-bit/64-bit MP4 boxes and accepts generic MP4 as audio only when the complete inspected movie contains known audio-only tracks. Video/mixed, malformed and unidentified generic MP4 remain video and cannot pass an audio claim. The existing 4 KB read limit and established M4A/QuickTime recognition are retained, including M4A files with tail metadata or chapter tracks. Valid ADTS headers are recognized before MPEG. No upload size, owner, tenant, scanning or quota checks were relaxed.

**Recorder lifecycle and device compatibility.** The existing manual-stop path correctly waited for the final data event; it was not generally producing empty recordings. Reproductions instead exposed these distinct failures:

- `isTypeSupported()` was called even when absent; recorder construction, AudioContext construction and `start()` errors escaped after acquiring a microphone.
- Waveform analysis was required even on devices capable of recording without AudioContext or exposing the prefixed WebKit API.
- The maximum-duration timer could stop the recorder before the send handler installed `onstop`, leaving the later send waiting for an event that had already happened.
- Empty `MediaRecorder.mimeType` was forced to WebM even when the final chunks were MP4.
- A permission prompt could resolve after cancellation/unmount and activate an unwanted late stream.
- Permission denial, missing/busy devices, unsupported constraints and insecure origins were all presented as a generic permission problem.

`useVoiceRecorder.ts` now detects the secure context and capture/recording capabilities, negotiates WebM/Opus, WebM, MP4, AAC and Ogg with feature detection, and can use the browser default when the support probe is unavailable. It derives the final MIME from the recorder/chunks rather than inventing WebM. Waveform analysis is optional. Finalization handlers exist before recording starts, the final chunk is retained, duration is capped at the existing server maximum, and cancellation/error/unmount release tracks and contexts. A generation guard handles late permission grants. Persian errors give a recovery action appropriate to each failure.

A further actual-component regression test showed that repeated send clicks during finalization caused a false 'at least one second' error after a successful send. `ChatComposer.tsx` now permits only one finalization at a time. The new AAC fallback also exposed an existing filename branch that named every non-Ogg/non-MP4 note `.webm`; `LiveStore.sendVoice()` now uses `.aac` for AAC.

**Project companion-channel identity.** The project reducer creates a `project-local-*` project and `conv-local-*` companion. The POST response replaced the project ID but left the companion's temporary project/channel identity. The server transaction creates one canonical channel; its realtime notification then inserted that UUID beside the local stand-in. The sidebar rendered both, while a full snapshot after refresh removed the ghost.

The server's project creation/idempotency flow was not changed. The reducer now remaps the companion project ID and reconciles its temporary channel against the canonical channel by project identity in either HTTP/WebSocket order. It reuses the existing upsert path to preserve selection, inspector, message and unread references. It does not collapse groups, unrelated server channels, or same-title conversations. Replayed pending project actions are ignored. HTTP project completion also fetches the canonical `project_synced` companion, so a missed socket event does not leave the stand-in indefinitely.

**Ruled out.** The real frontend upload helper already preserved codec-qualified MIME consistently across the API plan, presigned policy field and Blob. Boundary tests verified the uploaded bytes, attachment payload, transport fallback, single client message ID across retries, attachment reuse, and unsent/error behavior. Those transport mechanisms were retained.

## Regression tests and verification

Tests were written before the corresponding fixes. The recorder baseline had 12 expected failures out of 15 focused cases. Against original reducer/LiveStore source, seven of eight channel tests failed, including both event orders and missing socket delivery. The AAC delivery test failed specifically on the `.webm` filename. The initial composer boundary reproduction failed on the false short-recording error before its guard was added; final coverage uses a real-browser double-click case rather than a mocked React-state test.

| Check | Result |
|---|---|
| `npm run -ws typecheck` | Passed all five workspaces |
| `npm run -ws lint` | Passed all five workspaces |
| API unit tests | 200 passed: existing 186 plus 14 audio-classification regressions |
| Web unit tests | 40 passed: recorder 24, identity reconciliation 8, delivery 8 |
| Shared Jalali/text unit tests | 13 passed |
| API integration suite | 297 passed across 25 files: existing 292 plus five voice-upload regressions |
| Demo production build | Passed compilation, lint/types and all 23 generated routes |
| Chat/project browser suites | 166 checks passed, zero failures or console problems |
| CI workflow validation | `actionlint` passed |
| Clean dependency install | Passed with the project's Node 22/npm toolchain |

The five browser suites were `phase31`, `phase2`, `files-and-bridge`, `interactions`, and the new `voice-recording`. The latter uses a synthetic microphone with the real browser MediaRecorder, decodes the nonempty finalized audio, verifies that exactly one note appears and every capture track ends, and checks actionable permission-denied UI. It never opens a physical microphone.

The new storage integration cases exercise presigned POST, completion, scan, WebSocket delivery, recipient history, an idempotent REST retry and authorized inline bytes/MIME for MP4, WebM/Opus and AAC. Negative cases retain cross-user/cross-workspace ownership checks and reject generic MP4 video claimed as audio.

Web now declares the already-used API Vitest version (5.0.2), has an ESM test configuration, and runs its regressions in the existing CI Web job. Web Node typings align with the API's existing 22.20.4 version to satisfy the test runner's peer requirement. Existing production dependency versions were preserved; the lockfile changes also reflect npm's workspace deduplication. Existing test assertions and migrations were not edited.

## Environment and limits

Playwright's Linux browser CDN returned a geographic HTTP 403. Browser verification therefore used installed Windows Chrome 155 against the Linux production build. Safari/mobile hardware was not physically tested; their capability/error/MIME paths are covered with controlled browser boundaries and structural upload fixtures. MP4 fixtures test container identification and transport, not AAC decoding on Apple hardware.

Docker Desktop's Ubuntu integration/bind and loopback limitations prevented running the integration client directly from WSL. A disposable Node 22 Alpine test runner used the same unchanged integration harness against isolated PostgreSQL 18, Redis 7 and SeaweedFS in one Docker network. Test tooling/bootstrap configuration is under ignored `.local/prod/`; it is not part of the production images. The existing local verification stack and its volumes were preserved.

Generic MP4 whose complete movie metadata is outside the existing sniffing prefix remains unsupported as before. Existing M4A recognition is preserved. Browser security still requires HTTPS or a trusted localhost origin; client JavaScript cannot grant microphone access on an insecure LAN URL.

Raw logs and baseline reproductions are kept under ignored `.local/prod/`. No production credentials, audio samples from a real microphone, database migrations or permission changes are part of this fix.

## Relevant references

- [WebKit MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/)
- [WebKit features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [MediaStream Recording specification](https://www.w3.org/TR/mediastream-recording/)
