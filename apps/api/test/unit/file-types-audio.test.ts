import { describe, expect, it } from 'vitest';
import { isSpoofed, sniff } from '../../src/modules/content/file-types.js';

/** ISO BMFF box structure only: these fixtures exercise sniffing, not media decoding. */
function box(type: string, body: Buffer, extended = false): Buffer {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : body.length + 8);
  header.write(type, 4, 'latin1');
  if (extended) header.writeBigUInt64BE(BigInt(body.length + 16), 8);
  return Buffer.concat([header, body]);
}

function handler(type: string, extended = false): Buffer {
  // FullBox version/flags, pre_defined, handler_type, reserved.
  return box('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from(type, 'latin1'), Buffer.alloc(12)]), extended);
}

function track(type: string, extended = false): Buffer {
  return box('trak', box('mdia', handler(type, extended), extended), extended);
}

function mp4(brand: string, handlers: readonly string[], extended = false): Buffer {
  return Buffer.concat([
    box('ftyp', Buffer.concat([Buffer.from(brand, 'latin1'), Buffer.alloc(4), Buffer.from('isommp42')]), extended),
    box('moov', Buffer.concat(handlers.map((type) => track(type, extended))), extended),
    box('mdat', Buffer.alloc(32)),
  ]);
}

function adts(crc = false): Buffer {
  const size = (crc ? 9 : 7) + 4;
  // AAC-LC, 44.1 kHz, stereo, one raw data block, variable bitrate.
  return Buffer.concat([
    Buffer.from([0xff, crc ? 0xf0 : 0xf1, 0x50, 0x80 | (size >> 11), (size >> 3) & 0xff, ((size & 7) << 5) | 0x1f, 0xfc]),
    Buffer.alloc(crc ? 6 : 4),
  ]);
}

describe('browser voice-note file types', () => {
  it.each(['isom', 'iso5', 'mp42'])('recognizes audio-only MP4 with the shared %s brand', (brand) => {
    const type = sniff(mp4(brand, ['soun']), 'voice.m4a');
    expect(type).toEqual({ mime: 'audio/mp4', kind: 'audio' });
    expect(type && isSpoofed('audio/mp4;codecs=mp4a.40.2', 'voice.m4a', type)).toBe(false);
  });

  it('keeps generic MP4 video classified as video even after an audio track', () => {
    for (const brand of ['isom', 'iso5', 'mp42']) {
      const type = sniff(mp4(brand, ['soun', 'vide']), 'voice.m4a');
      expect(type).toEqual({ mime: 'video/mp4', kind: 'video' });
      expect(type && isSpoofed('audio/mp4', 'voice.m4a', type)).toBe(true);
    }
  });

  it('retains audio-only M4A and QuickTime video support', () => {
    expect(sniff(mp4('M4A ', ['soun']), 'voice.m4a')).toEqual({ mime: 'audio/mp4', kind: 'audio' });
    expect(sniff(mp4('qt  ', ['vide']), 'clip.mov')).toEqual({ mime: 'video/quicktime', kind: 'video' });
  });

  it('handles extended box sizes without losing the parent boundaries', () => {
    expect(sniff(mp4('iso5', ['soun'], true), 'voice.mp4')).toEqual({ mime: 'audio/mp4', kind: 'audio' });
    expect(sniff(mp4('isom', ['soun', 'vide'], true), 'voice.mp4')?.kind).toBe('video');
  });

  it('requires complete generic MP4 movies and known audio handlers', () => {
    for (const brand of ['isom', 'iso5', 'mp42']) {
      expect(sniff(mp4(brand, ['soun']).subarray(0, 60), 'voice.m4a')?.kind).not.toBe('audio');
      expect(sniff(mp4(brand, ['soun', 'text']), 'voice.m4a')?.kind).not.toBe('audio');
      expect(sniff(mp4(brand, []), 'voice.m4a')?.kind).not.toBe('audio');
    }
  });

  it('preserves legacy M4A support when movie metadata is outside the sniffed prefix', () => {
    const type = box('ftyp', Buffer.concat([Buffer.from('M4A '), Buffer.alloc(4), Buffer.from('isommp42')]));
    const file = Buffer.concat([type, box('mdat', Buffer.alloc(5000)), box('moov', track('soun'))]);
    expect(sniff(file.subarray(0, 4096), 'voice.m4a')).toEqual({ mime: 'audio/mp4', kind: 'audio' });
    expect(sniff(type, 'voice.m4a')).toEqual({ mime: 'audio/mp4', kind: 'audio' });
    expect(sniff(mp4('M4A ', ['soun', 'text']), 'chapters.m4a')).toEqual({ mime: 'audio/mp4', kind: 'audio' });
  });

  it('does not interpret strings hidden in arbitrary payloads as audio tracks', () => {
    const file = Buffer.concat([
      box('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.alloc(4)])),
      box('free', Buffer.from('moovtrakmdiahdlr\0\0\0\0\0\0\0\0soun', 'latin1')),
      box('mdat', track('soun')),
    ]);
    expect(sniff(file, 'voice.m4a')?.kind).toBe('video');
  });

  it('fails closed for zero, undersized, oversized or truncated box headers', () => {
    const valid = mp4('isom', ['soun']);
    for (const size of [0, 2, 0xffff_ffff]) {
      const malformed = Buffer.from(valid);
      malformed.writeUInt32BE(size, 24);
      expect(sniff(malformed, 'voice.m4a')?.kind).not.toBe('audio');
    }
    const unsafeExtended = Buffer.from(valid);
    unsafeExtended.writeUInt32BE(1, 24);
    unsafeExtended.writeBigUInt64BE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 32);
    expect(sniff(unsafeExtended, 'voice.m4a')?.kind).not.toBe('audio');
    expect(() => sniff(valid.subarray(0, 28), 'voice.m4a')).not.toThrow();
  });

  it.each([false, true])('recognizes a validated AAC ADTS header (CRC: %s)', (crc) => {
    expect(sniff(adts(crc), 'voice.aac')).toEqual({ mime: 'audio/aac', kind: 'audio' });
  });

  it('rejects invalid AAC ADTS headers instead of passing them as MPEG audio', () => {
    const tooShort = adts().subarray(0, 6);
    const invalidRate = adts();
    invalidRate[2] = 0x7c; // Reserved sample-frequency index 15.
    const invalidLength = adts();
    invalidLength[3] = 0x80;
    invalidLength[4] = 0;
    invalidLength[5] = 0x1f; // Declares a zero-byte frame.
    for (const bytes of [tooShort, invalidRate, invalidLength]) expect(sniff(bytes, 'voice.aac')).toBeNull();
  });

  it('retains Opus WebM, Ogg and MPEG audio recognition', () => {
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('A_OPUS'), Buffer.alloc(64)]);
    expect(sniff(webm, 'voice.webm')).toEqual({ mime: 'audio/webm', kind: 'audio' });
    expect(sniff(Buffer.from('OggS\0OpusHead', 'latin1'), 'voice.ogg')).toEqual({ mime: 'audio/ogg', kind: 'audio' });
    expect(sniff(Buffer.from([0xff, 0xfb, 0x90, 0x64]), 'voice.mp3')).toEqual({ mime: 'audio/mpeg', kind: 'audio' });
  });
});
