# Blog presentation refinement

Worktree: taskdoon-phase4-integration, branch fix/prelaunch-critical-audit.
Base HEAD remains c5aa286fac6a227593013de1b2e15955dc72a338. Changes are uncommitted.
Pre-existing LeadForm, lead-validation, its tests/report and untracked AGENTS.md were
preserved; those belong to the preceding phase and are excluded from this change's review.

## Scope and data flow

- /blog uses CollectionPage and DocumentCards when no published blog landing document exists.
  Published landing sections also use DocumentCards. The homepage had a separate article
  markup branch in HomeSections; only its article branch now uses the same BlogCard.
- /blog/[slug] resolves the existing published article and renders DocumentPage/SectionRenderer.
  No CMS record, slug, media URL, publication state or article text was edited.
- The current article cover is supplied in data.cover for cards. The current detail template
  does not render that field as a cover, and no new detail cover was invented. Existing
  supported article hero media was tested with a local fixture and remains contained.

## Results

| Status  | Scenario                                | Evidence                                                                                                                                                                                                                                                                           |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS    | Duplicated index brand                  | Before: local HTML title was «مقاله‌ها \| تسک‌دون \| تسک‌دون». The fallback now uses an absolute metadata title; tests see one brand. Published page metadata still uses its existing siteMetadata path.                                                                           |
| PASS    | One published article                   | Deliberate full-width featured card at 1180px; title/copy precede the cover at 400px.                                                                                                                                                                                              |
| PASS    | Multiple articles / long Persian titles | Local GET-only fixture supplies three articles, including two synthetic long-title clones. Grid and no-horizontal-overflow assertions pass at both widths.                                                                                                                         |
| PASS    | Shared homepage card                    | Homepage and index use the article-only shared BlogCard. One anchor contains image and title; no duplicate tab stop. Keyboard focus outline checked.                                                                                                                               |
| PASS    | Navigation                              | Image activates the original URL in single mode, title in multi mode; explicit return link reaches /blog. Existing live article URL independently returns HTTP 200.                                                                                                                |
| PASS    | Article reading density                 | Scoped spacing reduces body offset compared with the same DOM using existing generic styles. With fonts loaded, first paragraph is within the initial 900px viewport (approximately y=502 desktop and y=534–561 narrow in recorded cases). This is not a performance/timing claim. |
| PASS    | Skip target                             | Main is focusable, its fragment target has sticky-header clearance, and keyboard activation focuses main below the header.                                                                                                                                                         |
| PASS    | Content and semantics                   | Five existing numbered subheadings are h3 under section h2 headings; five checklist items are ul/li. Whole published body wording matches the source fixture after removing whitespace/decorative bullet markers. Date and canonical URL match the original.                       |
| PASS    | Media                                   | Source/alt/date retained. Supported article hero cover decodes and uses contain. Card eager loading is bounded to the first three images; a fourth remains lazy.                                                                                                                   |
| BLOCKED | Native 200% browser zoom                | Connected browser only exposes viewport sizing, not native zoom. Ctrl+0 / Ctrl++ did not change devicePixelRatio=1 or innerWidth=1280. No viewport or CSS-scale result is claimed as actual 200% zoom. Owner-side native-browser confirmation was requested and is pending.        |

## Implementation boundary

- BlogCard.tsx and blog.css: shared article presentation, featured/grid/narrow layout,
  focus styling and scoped article spacing.
- Sections.tsx: article-only card branch and opt-in article semantics in RichText.
  Non-article RichText behavior remains unchanged.
- HomeSections.tsx: only the article card branch changes.
- DocumentPage.tsx: article return link and article-renderer opt-in.
- app/(marketing)/blog/page.tsx: verified fallback-title correction.
- app/(marketing)/blog/[slug]/page.tsx: article-only styling wrapper.
- app/(marketing)/layout.tsx: blog stylesheet and focusable shared skip target.
- No article content, public URL, API, schema, permission or dependency changes.

## Verification and artifacts

- Browser fixture tests: 74 assertions pass at 400 and 1180px, including single/multiple
  articles, long titles, focus, image/title activation, return/skip links, wording, dates,
  canonical URL and supported media. Final log is under .local/blog-browser-final-frozen.log.
- Seven tests pass across blog-presentation.test.ts, marketing-copy.test.ts and
  site-images.test.ts. Unit regression also limits eager loading to the first three cards.
- Web typecheck, targeted source lint and formatting/diff checks pass.
- An initial media-fixture check failed because the already-running fixture process had
  not loaded the new fixture branch. Restarting that owned local helper corrected the fixture.
  No product workaround or assertion relaxation was introduced.
- Development LCP warnings exposed lazy above-fold card images. The article-card branch now
  eagerly loads the first grid row, without changing media data or suppressing warnings.
- Native browser zoom and actual assistive-technology speech remain unverified.

Screenshots of the actual local UI:

- apps/web/e2e/out/blog-400-single.png
- apps/web/e2e/out/blog-1180-single.png
- apps/web/e2e/out/blog-400-multi.png
- apps/web/e2e/out/blog-1180-multi.png
- apps/web/e2e/out/article-400-single.png
- apps/web/e2e/out/article-1180-single.png

The GET-only local fixture (.local/blog-fixture.mjs, port 4187) replays the existing public
snapshot and creates clones only in its response for fixture modes. It never writes CMS
data. The opt-in browser test requires BLOG_PRESENTATION_FIXTURE=1 and a local BASE_URL
(3165 in this run). Real article and QA records remain untouched. No publishing, deployment,
database cleanup, deletion, reset/reseed, permission changes or live messages occurred.
