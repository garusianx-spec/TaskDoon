# GitHub Actions CI/CD and GHCR delivery

Phase 1 was committed as `cbfa72be7fe4c172e7c38b0e2f1fc0f1cde090c4` and pushed to `origin/feat/devops-phase1-containerization`. Phase 2 is based on that commit on `feat/devops-phase2-cicd`. Work from `/home/user/taskin`.

## CI gate

`.github/workflows/ci.yml` runs for pull requests targeting `main`, pushes to `feat/*`, and reusable `workflow_call` invocations. Concurrency cancels superseded CI runs. Fork pull requests receive no deployment secrets or package-write permission; the workflow uses `pull_request`, not `pull_request_target`.

| Job | Checks |
|---|---|
| `lint-and-typecheck` | Locked npm install with npm download cache; all workspace lint/type checks; Jalali/text unit tests; contrast; deployment helper safety tests |
| `test-api` | API unit tests, migration journal/schema drift guard, full integration suite on a fresh PostgreSQL 18 database and Redis 7 service containers, plus real SeaweedFS S3 |
| `test-web` | Production Next.js build in demo mode and the complete existing demo Playwright suites |
| `docker-build-dryrun` | BuildKit matrix for API runner, Web runner, and isolated migrator; no login or image publishing |
| `compose` | API, migrator, PgBouncer and infrastructure readiness/sign-in |
| `scale` | Two WebSocket nodes, HTTP role, worker and edge; cross-node delivery/room updates |
| `e2e-live` | All six existing live suites: collaboration, platform administration, password recovery, platform moderation, workspace moderation, and Agile |

Existing test assertions and migrations are unchanged. CI-only Compose overlays pin infrastructure images, bind diagnostic ports to loopback, replace shell/wget probes with bounded Node probes, and remove migration-owner credentials from daemon roles. The live admin suites invoke the existing separately compiled host CLI with ephemeral test owner credentials; the production runner continues to exclude operator CLIs.

The integration harness already creates database roles/templates and uses PostgreSQL's native UUIDv7 function. It therefore retains PostgreSQL 18; production-parity PostgreSQL 16 uses the separately verified fresh-volume compatibility bootstrap from Phase 1. Integration mail uses an in-memory transport. Storage tests require a real S3 bucket, so omitting storage would silently remove coverage.

All third-party Actions are pinned to full commit SHAs with release comments. Node is pinned to 22.23.3. Hosted jobs use Ubuntu 24.04. Playwright installs the browser revision from the locked playwright-core package. Docker cache scopes are `taskdoon-api`, `taskdoon-web`, and `taskdoon-migrator`, using GHA cache version 2. The GHA backend caches Docker layers; setup-node separately caches npm downloads for host jobs. BuildKit npm cache-mount contents are not automatically exported by the GHA backend across ephemeral runners, although unchanged manifests can reuse the completed npm-ci layer. `node_modules` is not shared across platforms.

## Release and deployment

`.github/workflows/release.yml` runs on pushes to `main` and manual dispatch. A manual dispatch from any other ref skips publication/deployment. Release runs serialize with cancellation disabled. The reusable CI gate checks the exact release commit before registry-write jobs start.

Delivery order:

1. Run the complete CI gate.
2. Validate the root package's stable `x.y.z` version, lowercase the registry owner, and require the commit to still be current `main`.
3. Build and publish all three Linux/amd64 targets under short and full SHA tags. Record each delivered digest in the job summary; attach BuildKit provenance and SBOMs.
4. After every publish succeeds, check current `main` again and promote those existing indexes to the package version and `latest`, without rebuilding.
5. Enter the `production` environment, check current `main` again, and POST the Coolify deployment webhook.

| Image | Docker target |
|---|---|
| `ghcr.io/<lowercase-owner>/taskdoon-api` | `apps/api/Dockerfile`, `runner` |
| `ghcr.io/<lowercase-owner>/taskdoon-web` | `apps/web/Dockerfile`, `runner` |
| `ghcr.io/<lowercase-owner>/taskdoon-migrator` | `apps/api/Dockerfile`, `migrator` |

Metadata produces the package semver (currently `0.1.0`), `sha-<12 characters>`, `sha-<full commit>`, and `latest`. Package-version and latest aliases are mutable: a subsequent main release with the same package version moves those aliases. Bump `package.json` when assigning a new semantic release. Full SHA tags identify source revisions; an `@sha256:...` digest fixes the exact published image bytes and is the strongest rollback reference.

Three GHCR repositories cannot be promoted atomically. A registry failure during promotion can leave some mutable aliases updated; the deployment job will not run. Disable independent registry auto-deploy triggers and use this pipeline's final all-images webhook. Rerun the current-main release to finish promotion, or deploy a coordinated set of previously recorded digests. A stale main run is rejected rather than overwriting aliases after a long build.

## Required configuration

Create a GitHub environment named `production` and restrict deployment refs to `main`. Configure its secrets, or equivalent repository secrets:

| Secret | Purpose |
|---|---|
| `COOLIFY_WEBHOOK_URL` | HTTPS deployment webhook copied from the intended Coolify application/Compose resource |
| `COOLIFY_API_TOKEN` | Coolify API token scoped to the intended team and deploy-only permission; enable Coolify API access and set an expiration |

`GITHUB_TOKEN` is supplied automatically. No publishing PAT is required. Workflow/default/CI jobs have only `contents: read`. Only publish and tag-promotion jobs add `packages: write`; the deploy job keeps `contents: read` for checkout and the main-ref guard. Checkout does not persist credentials. Ensure repository/organization policy permits Actions to create/write these GHCR packages and that existing packages grant this repository Actions access.

Missing deployment secrets fail the deployment step with a safe message, after images have published; they do not silently mark deployment complete. Optional environment reviewers are an organization policy choice. Configure required branch checks for the CI jobs above, including all three Docker matrix entries, before permitting main merges.

Configure Coolify to pull the published images rather than rebuild the source checkout. API HTTP/realtime/worker roles share the API image; migrations use only the migrator image with a one-shot command and dedicated owner credentials. Private GHCR pulls require a separate deployment-side credential with `read:packages`; the workflow's short-lived token is not a persistent server credential. Keep JWT/database/Redis/S3/SMS/SMTP runtime secrets in Coolify's secret configuration.

Repository variables affecting the Web build:

| Variable | Default |
|---|---|
| `NEXT_PUBLIC_RT_URL` | Empty: same-origin realtime through the edge |
| `TASKIN_API_ORIGIN` | `http://api:4000`: build-time Next rewrite destination |

`NEXT_PUBLIC_DATA_SOURCE=api` is fixed for delivery. Public values and rewrites are compiled into the image and require rebuilding when changed. Never use these variables for secrets. Configure Coolify's service names and edge routes to match the selected origins; preserve first-party secure cookies and S3 signed Host/path behavior described in [containerization.md](containerization.md).

The webhook helper accepts only HTTPS, rejects credential/header injection and redirects, disables user curl configuration/netrc, and sends its URL/token via stdin. It discards response bodies and emits only allowlisted acceptance/failure messages. Connection timeout is 10 seconds, each transfer is bounded to 30 seconds, retry count is three for transient failures, retry budget is 120 seconds, and the process has a 155-second hard cap. Retries after an ambiguous response can enqueue duplicate deployments because Coolify provides no documented idempotency key. An accepted 2xx request means deployment was queued; inspect Coolify health/status to confirm rollout completion.

## Local validation

Use Node 22.23.3 and Docker with BuildKit/Compose 2.24.4+.

```sh
cd /home/user/taskin
npm ci --no-audit --no-fund
npm run -ws typecheck
npm run -ws lint
npm test
npm run check:contrast
node --test infra/ci/trigger-coolify.test.mjs
actionlint .github/workflows/ci.yml .github/workflows/release.yml
docker compose -f infra/docker-compose.yml -f infra/ci/compose.yml --profile app config --quiet
docker compose -f infra/docker-compose.yml -f infra/compose.scale.yml -f infra/ci/compose.yml -f infra/ci/compose.scale.yml --profile scale config --quiet
DOCKER_BUILDKIT=1 docker build --target runner -f apps/api/Dockerfile -t taskdoon-api:ci-dryrun .
DOCKER_BUILDKIT=1 docker build --target runner -f apps/web/Dockerfile -t taskdoon-web:ci-dryrun .
DOCKER_BUILDKIT=1 docker build --target migrator -f apps/api/Dockerfile -t taskdoon-migrator:ci-dryrun .
```

To reproduce the full jobs on a normal Linux host, use their commands/environment directly. The API integration job expects its PostgreSQL/Redis services and S3 endpoint at the explicit loopback URLs shown in the workflow. The demo/live jobs require the locked Chromium revision and OS libraries. Compose jobs use unique project names and clean only their own disposable volumes.

Validation for this change: Phase 1's requested workspace typecheck/lint checks passed; `npm test` passed all 186 API unit tests and shared package tests. The five new webhook safety tests and a local trusted-TLS mock passed (POST, credential escaping, acceptance, authentication failure, redirect rejection, transient retry, redacted output). Both workflows passed actionlint and both CI Compose topologies rendered successfully. All three Docker targets were rebuilt locally with BuildKit without publishing. All five daemon configurations also excluded migration-owner credentials when the host exported a sentinel value. Contrast passed all 312 checks. Migration journal checking passed, and generation found 46 tables with no database changes.

GitHub Actions, GHCR publication and the real Coolify endpoint have not been executed for this unpushed Phase 2 working tree. The local TLS mock used synthetic credentials. The Windows host's WSL/Docker bind restriction and Phase 1 workaround are documented in [verification.md](verification.md). Local results do not claim that the remote workflow, full integration suites, or browser/live jobs have already passed.

## References

- [GitHub workflow security and immutable action pins](https://docs.github.com/en/actions/reference/security/secure-use)
- [GHCR publishing permissions](https://docs.github.com/en/enterprise-cloud@latest/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions)
- [Docker GHA cache backend](https://docs.docker.com/build/cache/backends/gha/)
- [Docker image metadata](https://github.com/docker/metadata-action#tags-input)
- [Coolify deployment webhooks](https://coolify.io/docs/core/automation/deploy-webhooks)
- [Coolify GitHub Actions deployment](https://coolify.io/docs/applications/sources/github/actions)
