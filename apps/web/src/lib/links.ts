/**
 * Hyperlink extraction for the shared-links tab. There is no unfurling service behind this
 * front end, so a link's title is derived from its URL: a known-site name plus the most
 * descriptive path segment, humanised.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+[^\s<>"'«».,،؛:!?)\]]/g;

const KNOWN_SITES: ReadonlyArray<{ readonly host: RegExp; readonly name: string }> = [
  { host: /(^|\.)figma\.com$/, name: 'فیگما' },
  { host: /(^|\.)github\.com$/, name: 'گیت‌هاب' },
  { host: /(^|\.)gitlab\.com$/, name: 'گیت‌لب' },
  { host: /(^|\.)docs\.google\.com$/, name: 'اسناد گوگل' },
  { host: /(^|\.)notion\.so$/, name: 'نوشن' },
  { host: /^docs\./, name: 'مستندات' },
];

export interface SharedLink {
  readonly url: string;
  readonly host: string;
  readonly siteName: string;
  readonly title: string;
}

export function extractUrls(text: string): readonly string[] {
  return Array.from(text.matchAll(URL_PATTERN), (match) => match[0]);
}

function humanise(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape is shown as written.
  }
  return decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function describeLink(url: string): SharedLink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, host: url, siteName: url, title: url };
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const siteName = KNOWN_SITES.find((site) => site.host.test(host))?.name ?? host;
  // The last segment that carries words, not an opaque id (`k9Qe7`) or a bare version tag.
  const segments = parsed.pathname.split('/').filter(Boolean);
  const descriptive = [...segments].reverse().find((segment) => /[-_]|[^\x00-\x7F]/.test(segment) || segment.length > 12);
  const title = descriptive ? humanise(descriptive) : (segments.length ? humanise(segments[segments.length - 1] ?? '') : host);
  return { url, host, siteName, title };
}
