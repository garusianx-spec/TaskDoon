# TaskDoon

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Persian-speaking teams, startups, small and medium-sized businesses, project managers,
and team leaders. Individual productivity is a secondary use case.

## Product Purpose

Bring tasks, projects, conversations, and notes into one workspace so teams can see
progress, understand who owns each task, and collaborate around the work itself.

## Operating Context

The public website helps prospective teams evaluate the product. The application uses
Iranian mobile numbers and OTP-first authentication, with password login where supported,
password recovery, invitation acceptance, and workspace onboarding.

## Capabilities and Constraints

- Persian-first content, RTL layouts, and the Jalali calendar are core product requirements.
- Reuse existing Next.js, shared components, semantic tokens, API contracts, and session management.
- Preserve published CMS content, draft/publication workflows, public routing, and SEO.
- Authentication must retain backend verification, rate limits, session invalidation, and CSRF protections.
- Access tokens stay in memory; refresh tokens remain in HttpOnly cookies.
- Automated tests must use an isolated test environment and must not send real SMS.
- Production data and deployments require separate explicit authorization.
- Workspace UI is outside this redesign except where login or onboarding requires it.

## Brand Commitments

TaskDoon / تسک‌دون. Primary indigo #3538CD and existing self-hosted IRANYekan typography.
Professional, clear, natural Persian. Public marketing defaults to a light presentation
without overwriting saved workspace theme preferences. The user chose code-first implementation.

## Evidence on Hand

The existing repository, the previous homepage redesign branch, and the supplied Figma
design-system file are the source material. Authentic product previews are required.
No customer quotes, logos, usage statistics, pricing promises, or unsupported capabilities
may be invented. Published content must be verified through the API where available;
fixtures alone do not establish CMS integration.

## Product Principles

- Demonstrate the actual product before making broad claims.
- Make ownership and project visibility easy to understand.
- Keep the entry flow continuous for existing users, new users, and invited members.
- Explain errors safely in Persian and give a useful recovery action.
- Preserve product behavior while improving its presentation.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Support keyboard and screen-reader navigation, Persian and Latin
digits, reduced motion, accessible OTP entry, and responsive layouts from 360px to 1920px.
