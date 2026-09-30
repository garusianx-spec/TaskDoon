import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '../../src/platform/http/user-agent.js';

describe('Platform admin: what a session’s user agent says', () => {
  it('names the browser, the system and the form factor', () => {
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36')).toEqual({
      client: 'Chrome 128',
      os: 'Android 14',
      deviceType: 'mobile',
    });
    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toEqual({
      client: 'Safari 17.5',
      os: 'iOS 17.5',
      deviceType: 'mobile',
    });
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42')).toEqual({
      client: 'Edge 128',
      os: 'Windows',
      deviceType: 'desktop',
    });
    expect(parseUserAgent('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toEqual({ client: 'Firefox 130', os: 'Linux', deviceType: 'desktop' });
  });

  it('tells tablets apart and knows the less common browsers', () => {
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36')).toEqual({
      client: 'Samsung Internet 25',
      os: 'Android 13',
      deviceType: 'tablet',
    });
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0.6533.107 Mobile/15E148 Safari/604.1')).toMatchObject({
      client: 'Chrome 127',
      deviceType: 'tablet',
    });
    expect(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0').client).toBe('Opera 113');
    expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36').client).toBe('Chrome Headless 131');
  });

  it('says nothing it cannot tell', () => {
    expect(parseUserAgent(null)).toEqual({ client: null, os: null, deviceType: null });
    expect(parseUserAgent('curl/8.9.1')).toEqual({ client: null, os: null, deviceType: null });
  });
});
