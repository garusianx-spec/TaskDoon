# Homepage redesign validation

Tested locally on 2026-10-24 with Node 26 and Chromium, using the existing project dependencies. Base: `f9f4da2c5ab87d9ce38ee7c1a66068cf1aa14f8a` on `feature/taskdoon-marketing-website`.

## Passed

- `npm run build`: all workspace packages, API and Next.js production build.
- `npm run lint`: all workspace lint commands.
- `npm run typecheck`: all workspace type checks, including the API test configuration.
- `npm run test -w @taskin/api -- --reporter=dot`: 186 tests in 6 files passed.
- All 29 seed documents passed the actual `validateSiteDocument` validator; published seeds also passed `validateSitePublish`.
- `apps/web/e2e/homepage-redesign.mjs`: 87 assertions passed, 0 failed, 0 browser console problems, against the production Next build and a local synthetic public CMS fixture generated from the actual seed documents.
- Browser widths: 1440, 1280, 768, 390 and 360px. Verified RTL, zero horizontal overflow, all images decoded, navigation destinations, functional preview state, FAQ Enter/Space and ARIA state, mobile menu Escape/focus restoration, carousel navigation, reduced motion, pointer parallax, sticky header, server-visible hero and SEO metadata.
- Additional visual checks at 375 and 1280px and the existing dark theme. `/admin/site`, `/feed`, `/tasks`, `/notes`, `/chats` and `/calendar` returned HTTP 200 (route smoke checks only).
- `git diff --check`.

## Screenshots

- [1440px desktop](visual-review/homepage-1440.png)
- [390px mobile](visual-review/homepage-390.png)

These screenshots use synthetic/demo content from the supplied design and the CMS seeds. They contain no customer workspace data. The 1440px screenshot was visually compared with the supplied PDF. The page is responsive HTML, not an embedded image of the PDF. Small composition adjustments accommodate content labels and the current repository font configuration.

## Limits

The real API startup was attempted and exited with code 78 because this environment has no configured database, Redis, S3, encryption key or OTP pepper. The real live CMS draft/save/private-preview/publish/restore test and authenticated workspace flows therefore **were not run**. No production database was changed. HTTP 200 smoke checks do not establish those workflows work end to end.

LCP, INP and CLS field performance targets were not measured or certified. No public deployment or pull request was created.

Figma asset HTTP downloads returned a challenge/TLS timeout. Original PDF artwork was exported instead; the source map is included with the assets. Monochrome logo exports have their white matte removed so the existing dark theme remains usable.

Existing installations retain all published content. The new template is applied to a draft from `/admin/site` and uses the existing save/private-preview/publish/revision workflow. See [adoption and implementation notes](homepage-redesign.md).
