import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { useVoiceRecorder, type RecorderState } from '../src/hooks/useVoiceRecorder';

interface Hooks {
  useState(initial: RecorderState): [RecorderState, (value: RecorderState) => void];
  useRef(current: unknown): { current: unknown };
  useCallback<T>(callback: T): T;
  useEffect(effect: () => void | (() => void)): void;
}
const boundary = vi.hoisted(() => ({ current: null as Hooks | null }));
vi.mock('react', () => ({
  useState: (initial: RecorderState) => boundary.current!.useState(initial),
  useRef: (current: unknown) => boundary.current!.useRef(current),
  useCallback: <T>(callback: T) => boundary.current!.useCallback(callback),
  useEffect: (effect: () => void | (() => void)) => boundary.current!.useEffect(effect),
}));
afterEach(() => { vi.unstubAllGlobals(); });

type Stream = { getTracks(): { stop(): void }[] };
interface Options {
  supports?: (type: string) => boolean;
  mimeType?: string;
  chunkType?: string;
  noSupportProbe?: boolean;
  noAudioContext?: boolean;
  noRecorder?: boolean;
  noMediaDevices?: boolean;
  secure?: boolean;
  constructorError?: Error;
  startError?: Error;
  permissionError?: Error;
  getStream?: (stream: Stream) => Promise<Stream>;
}

/**
 * Exercise the real hook's recorder lifecycle: only React's storage hooks and the external
 * Media APIs are controlled boundaries. The final chunk arrives after stop(), as in browsers.
 */
function harness(options: Options = {}) {
  let state: RecorderState = { phase: 'idle' };
  let time = 0;
  let interval: (() => void) | undefined;
  let cleanup: (() => void) | void;
  let requested = 0;
  let constructed = 0;
  let stoppedTracks = 0;
  let contextClosed = 0;
  let recorder: Recorder | undefined;
  let constructorOptions: { mimeType?: string } | undefined;
  const stream: Stream = { getTracks: () => [{ stop: () => { stoppedTracks += 1; } }] };
  class Recorder {
    static isTypeSupported(type: string) { return options.supports?.(type) ?? type === 'audio/webm;codecs=opus'; }
    state = 'inactive';
    mimeType = options.mimeType ?? 'audio/webm;codecs=opus';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: ((event: object) => void) | null = null;
    onerror: ((event: object) => void) | null = null;
    constructor(_stream: Stream, config?: { mimeType?: string }) {
      constructed += 1;
      constructorOptions = config;
      if (options.constructorError) throw options.constructorError;
      recorder = this;
    }
    start() {
      if (options.startError) throw options.startError;
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['final audio'], { type: options.chunkType ?? this.mimeType }) });
        this.onstop?.({});
      });
    }
  }
  if (options.noSupportProbe) Object.defineProperty(Recorder, 'isTypeSupported', { value: undefined });
  class Context {
    createAnalyser() {
      return { fftSize: 512, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) };
    }
    createMediaStreamSource() { return { connect() {} }; }
    async close() { contextClosed += 1; }
  }
  boundary.current = {
    useState(initial: RecorderState) {
      state = initial;
      return [state, (next: RecorderState) => { state = next; }];
    },
    useRef: (current: unknown) => ({ current }),
    useCallback: <T>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void)) => { cleanup = effect(); },
  };
  const window = {
    isSecureContext: options.secure ?? true,
    MediaRecorder: options.noRecorder ? undefined : Recorder,
    AudioContext: options.noAudioContext ? undefined : Context,
    setInterval: (callback: () => void) => { interval = callback; return 1; },
    clearInterval: () => { interval = undefined; },
  };
  const navigator = options.noMediaDevices ? {} : { mediaDevices: { async getUserMedia() {
    requested += 1;
    if (options.permissionError) throw options.permissionError;
    return options.getStream ? options.getStream(stream) : stream;
  } } };
  vi.stubGlobal('window', window);
  vi.stubGlobal('navigator', navigator);
  vi.stubGlobal('MediaRecorder', window.MediaRecorder);
  vi.stubGlobal('AudioContext', window.AudioContext);
  vi.stubGlobal('performance', { now: () => time });
  const hook = useVoiceRecorder();
  return {
    hook, stream,
    get state() { return state; },
    get recorder() { assert.ok(recorder); return recorder; },
    get constructorOptions() { assert.ok(constructorOptions); return constructorOptions; },
    get requested() { return requested; },
    get constructed() { return constructed; },
    get stoppedTracks() { return stoppedTracks; },
    get contextClosed() { return contextClosed; },
    tick(ms: number) { time += ms; interval?.(); },
    unmount() { cleanup?.(); },
  };
}

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

test('manual stop waits for the final audio chunk and keeps its negotiated MIME', async () => {
  const h = harness();
  await h.hook.start();
  h.tick(1500);
  const result = await h.hook.stop();
  assert.ok(result);
  assert.equal(await result.blob.text(), 'final audio');
  assert.equal(result.blob.type, 'audio/webm;codecs=opus');
  assert.equal(result.durationSec, 2);
  assert.equal(result.waveform.length, 64);
  assert.equal(h.stoppedTracks, 1);
});

test('MP4-only browsers record using the supported container', async () => {
  const h = harness({ supports: (type) => type === 'audio/mp4', mimeType: 'audio/mp4' });
  await h.hook.start();
  h.tick(1500);
  const result = await h.hook.stop();
  assert.ok(result);
  assert.equal(h.constructorOptions.mimeType, 'audio/mp4');
  assert.equal(result.blob.type, 'audio/mp4');
});

test('browsers without isTypeSupported use the platform recorder default', async () => {
  const h = harness({ noSupportProbe: true, mimeType: 'audio/mp4' });
  await assert.doesNotReject(h.hook.start());
  h.tick(1500);
  const result = await h.hook.stop();
  assert.ok(result);
  assert.equal(result.blob.type, 'audio/mp4');
});

test('an empty recorder MIME uses the actual recorded chunk MIME', async () => {
  const h = harness({ mimeType: '', chunkType: 'audio/mp4' });
  await h.hook.start();
  h.tick(1500);
  const result = await h.hook.stop();
  assert.ok(result);
  assert.equal(result.blob.type, 'audio/mp4');
});

test('missing AudioContext does not prevent recording', async () => {
  const h = harness({ noAudioContext: true });
  await assert.doesNotReject(h.hook.start());
  h.tick(1500);
  const result = await h.hook.stop();
  assert.ok(result);
  assert.equal(result.blob.size, 11);
  assert.equal(h.stoppedTracks, 1);
});

test('recorder construction failures are reported and release the microphone', async () => {
  const h = harness({ constructorError: new DOMException('unsupported', 'NotSupportedError') });
  await assert.doesNotReject(h.hook.start());
  assert.equal(h.state.phase, 'error');
  assert.equal(h.stoppedTracks, 1);
});

test('recorder start failures are reported and release all media resources', async () => {
  const h = harness({ startError: new DOMException('not readable', 'NotReadableError') });
  await assert.doesNotReject(h.hook.start());
  assert.equal(h.state.phase, 'error');
  assert.equal(h.stoppedTracks, 1);
  assert.equal(h.contextClosed, 1);
});

test('stopping after the recording limit resolves the already-finalized recording', async () => {
  const h = harness();
  await h.hook.start();
  h.tick(3_600_000);
  await flush();
  let resolved = false;
  const pending = h.hook.stop().then((result) => { resolved = true; return result; });
  await flush();
  assert.equal(resolved, true, 'stop must not wait for an onstop event that already fired');
  const result = await pending;
  assert.ok(result);
  assert.equal(result.durationSec, 3600);
  assert.equal(h.stoppedTracks, 1);
});

test('cancelling while the permission prompt is pending does not start a late recording', async () => {
  let grant: (() => void) | undefined;
  const h = harness({ getStream: (stream) => new Promise((resolve) => { grant = () => resolve(stream); }) });
  const pending = h.hook.start();
  h.hook.cancel();
  grant!();
  await pending;
  assert.equal(h.constructed, 0);
  assert.equal(h.stoppedTracks, 1);
  assert.equal(h.state.phase, 'idle');
});

test('unmounting stops the recorder and releases the microphone', async () => {
  const h = harness();
  await h.hook.start();
  h.unmount();
  assert.equal(h.recorder.state, 'inactive');
  assert.equal(h.stoppedTracks, 1);
});

test('insecure contexts explain that HTTPS is required before requesting permission', async () => {
  const h = harness({ secure: false, noMediaDevices: true });
  await h.hook.start();
  assert.equal(h.state.phase, 'error');
  assert.match(h.state.message, /HTTPS/);
  assert.equal(h.requested, 0);
});

for (const [name, expected] of [
  ['NotAllowedError', /اجازه|دسترسی/],
  ['NotFoundError', /پیدا|یافت/],
  ['NotReadableError', /مشغول|برنامه/],
  ['OverconstrainedError', /تنظیمات|پشتیبانی/],
] as const) {
  test('microphone error ' + name + ' has an actionable explanation', async () => {
    const h = harness({ permissionError: new DOMException('browser details', name) });
    await h.hook.start();
    assert.equal(h.state.phase, 'error');
    assert.match(h.state.message, expected);
    assert.equal(h.constructed, 0);
  });
}


test.each(['audio/aac', 'audio/ogg;codecs=opus'])('falls back to %s when it is the available audio format', async (mimeType) => {
  const h = harness({ supports: (type) => type === mimeType, mimeType });
  await h.hook.start();
  h.tick(1500);
  const result = await h.hook.stop();
  assert.ok(result);
  assert.equal(result.blob.type, mimeType);
  assert.equal(h.constructorOptions.mimeType, mimeType);
});

test('recorder errors remain visible and release the microphone', async () => {
  const h = harness();
  await h.hook.start();
  h.recorder.onerror?.({ error: new DOMException('device failed', 'NotReadableError') });
  assert.equal(h.state.phase, 'error');
  assert.match(h.state.phase === 'error' ? h.state.message : '', /مشغول|برنامه/);
  assert.equal(h.stoppedTracks, 1);
  assert.equal(await h.hook.stop(), null);
});

test('repeated clicks during a permission prompt request only one microphone stream', async () => {
  let grant: (() => void) | undefined;
  const h = harness({ getStream: (stream) => new Promise((resolve) => { grant = () => resolve(stream); }) });
  const first = h.hook.start();
  await h.hook.start();
  grant!();
  await first;
  assert.equal(h.requested, 1);
  assert.equal(h.constructed, 1);
  h.hook.cancel();
});

test('concurrent stops consume the final recording only once', async () => {
  const h = harness();
  await h.hook.start();
  h.tick(1500);
  const results = await Promise.all([h.hook.stop(), h.hook.stop()]);
  assert.equal(results.filter((result) => result !== null).length, 1);
  assert.equal(h.stoppedTracks, 1);
});

test('recordings with no determinable MIME are rejected rather than mislabeled as WebM', async () => {
  const h = harness({ noSupportProbe: true, mimeType: '', chunkType: '' });
  await h.hook.start();
  h.tick(1500);
  assert.equal(await h.hook.stop(), null);
  assert.equal(h.state.phase, 'error');
  assert.equal(h.stoppedTracks, 1);
});

test.each([{ noRecorder: true }, { noMediaDevices: true }])('unsupported media APIs report an error without requesting permission (%j)', async (options) => {
  const h = harness(options);
  await h.hook.start();
  assert.equal(h.state.phase, 'error');
  assert.equal(h.requested, 0);
});

test('a too-short recording is discarded after its tracks are released', async () => {
  const h = harness();
  await h.hook.start();
  h.tick(100);
  assert.equal(await h.hook.stop(), null);
  assert.equal(h.stoppedTracks, 1);
});
