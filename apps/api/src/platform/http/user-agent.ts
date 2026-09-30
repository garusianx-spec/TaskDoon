/**
 * What a session's User-Agent says about the device, for the session lists (platform admin, and
 * later the member's own): the browser or app, the operating system and the form factor. A small
 * table of the clients TaskDoon actually sees, most specific first; anything else is `null`.
 */
export interface ParsedUserAgent {
  /** `Chrome 128`, `Safari 17`, `TaskDoon Android` … */
  readonly client: string | null;
  /** `Android 14`, `iOS 17.5`, `Windows`, `macOS`, `Linux` … */
  readonly os: string | null;
  readonly deviceType: 'mobile' | 'tablet' | 'desktop' | null;
}

const CLIENTS: readonly (readonly [RegExp, string])[] = [
  [/\bTaskDoon\/([\d.]+)/i, 'TaskDoon'],
  [/\bEdg(?:A|iOS)?\/(\d+)/, 'Edge'],
  [/\bOPR\/(\d+)/, 'Opera'],
  [/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/\bFirefox\/(\d+)/, 'Firefox'],
  [/\bFxiOS\/(\d+)/, 'Firefox'],
  [/\bCriOS\/(\d+)/, 'Chrome'],
  [/\bHeadlessChrome\/(\d+)/, 'Chrome Headless'],
  [/\bChrome\/(\d+)/, 'Chrome'],
  [/\bVersion\/(\d+(?:\.\d+)?).*Safari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, (match: RegExpMatchArray) => string])[] = [
  [/\bAndroid (\d+(?:\.\d+)?)/, (match) => `Android ${match[1]}`],
  [/\b(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/, (match) => `iOS ${match[1]}.${match[2]}`],
  [/\bWindows NT/, () => 'Windows'],
  [/\bMac OS X/, () => 'macOS'],
  [/\bCrOS\b/, () => 'ChromeOS'],
  [/\bLinux\b/, () => 'Linux'],
];

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (!userAgent) return { client: null, os: null, deviceType: null };
  let client: string | null = null;
  for (const [pattern, name] of CLIENTS) {
    const match = pattern.exec(userAgent);
    if (match) {
      client = match[1] ? `${name} ${match[1]}` : name;
      break;
    }
  }
  let os: string | null = null;
  for (const [pattern, name] of SYSTEMS) {
    const match = pattern.exec(userAgent);
    if (match) {
      os = name(match);
      break;
    }
  }
  const tablet = /\biPad\b|\bTablet\b/i.test(userAgent) || (/\bAndroid\b/.test(userAgent) && !/\bMobile\b/.test(userAgent));
  const mobile = !tablet && /\bMobile\b|\biPhone\b|\biPod\b/.test(userAgent);
  const deviceType = tablet ? 'tablet' : mobile ? 'mobile' : os ? 'desktop' : null;
  return { client, os, deviceType };
}
