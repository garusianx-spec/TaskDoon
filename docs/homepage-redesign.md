# Homepage redesign

Source: `Desktop - 3.pdf` (1440 × 6442) and [Figma frame 32:3352](https://www.figma.com/design/nEdcMkY6UUy77tBlRmr6Ii/TaskDoon?node-id=32-3352).

## Existing CMS installations

Existing published documents are **never overwritten** by startup or seeds. In `/admin/site`, open the `home` page, choose **بارگذاری قالب صفحه اصلی از طرح**, review the replacement warning, and apply it to the local draft. Review/edit the copy, save the draft, open its private preview, then use the existing publish workflow when ready. Loading the template does not save or publish. Saved revisions remain available through the existing history/restore flow.

New installations receive the composition through the existing seed mechanism. All section titles, descriptions, items, media and CTAs remain standard CMS fields. Sections can be hidden, reordered, duplicated and deleted. The section editor can enable/disable the homepage composition per block. FAQ answers and published articles remain separate CMS documents. Published articles replace the explicitly labelled design examples; unpublished article documents are never fetched into the public page.

Sample company logos are labelled as design examples, sample quotes/personas are labelled as unverified, and no ratings/review counts are displayed. Orbit icons are decorative and do not imply integrations. No contact details or social destinations are invented. Video activation uses the existing `videoUrl` only when configured; otherwise the play control explains that the design is a preview.

## Implementation

The existing `SectionRenderer` delegates only blocks with an explicit `data.presentation: home-<type>` value. Other pages and custom sections keep their current renderer. The same renderer is used in private previews. Public reads, metadata, canonical URLs, structured data, sitemap, robots, authentication and workspace routes retain their existing code paths. No database migration or new dependency is required.

Reuses `LogoMark`, `MarketingLogo`, `SiteLink`, `Button`, `Input`, existing IRANYekanX fonts and semantic surfaces/foreground/borders/brand/status/shadows. Documented composition tokens live in `homepage.css`; no second component library or theme system is added.

Motion uses CSS and IntersectionObserver/Web Animations: staged hero entrance, restrained floating cards, desktop pointer parallax, staggered scroll reveals, hover elevation, orbit drift, native touch scrolling for quotes, button interactions, sticky-header transition, mobile menu and FAQ expansion. Reduced-motion disables animation/parallax and smooth scrolling; mobile removes continuous floating motion. Server content remains visible without JavaScript.

Original photo/artwork is exported from the supplied PDF because Figma asset downloads returned a WAF challenge/TLS timeout. `public/marketing/homepage/source-map.json` records isolated artwork locations. All text, cards and product examples are HTML; the page is not a flattened design image. Product examples are synthetic illustration data, never live customer data.

## Verification

See `homepage-validation.md` for actual command results and limits. Run the dedicated browser check against a running Next server and CMS API with `BASE_URL` and `CHROMIUM_PATH` set. It verifies breakpoints, RTL/overflow, navigation URLs, FAQ keyboard/ARIA, reduced motion, image loading and console errors. Live CMS publication/authentication checks still require the repository's real database/API stack.
