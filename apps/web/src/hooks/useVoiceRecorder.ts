'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Recorded {
  readonly blob: Blob;
  readonly durationSec: number;
  /** 64 samples, 0–100: the loudness over the recording, for the player's bars. */
  readonly waveform: readonly number[];
}

export type RecorderState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'recording'; readonly seconds: number; readonly level: number }
  | { readonly phase: 'error'; readonly message: string };

const WAVEFORM_POINTS = 64;
const SAMPLE_MS = 80;
/** The server keeps voice notes of 1 second to an hour. */
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;
const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

interface Session {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly context: AudioContext | null;
  readonly chunks: Blob[];
  readonly levels: number[];
  readonly startedAt: number;
  readonly stopped: Promise<void>;
  readonly resolveStopped: () => void;
  readonly requestedMime: string | undefined;
  stoppedAt: number | null;
  timer: number | null;
  released: boolean;
}

/** Resamples loudness readings to points bars scaled to 0–100 (the loudest bar is 100). */
export function toWaveform(levels: readonly number[], points = WAVEFORM_POINTS): number[] {
  if (levels.length === 0) return Array.from({ length: points }, () => 0);
  const bars = Array.from({ length: points }, (_, index) => {
    const from = Math.floor((index * levels.length) / points);
    const to = Math.max(from + 1, Math.floor(((index + 1) * levels.length) / points));
    const slice = levels.slice(from, to);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
  const peak = Math.max(...bars, 0.0001);
  return bars.map((value) => Math.round((value / peak) * 100));
}

function recordingError(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'اجازهٔ دسترسی به میکروفون را در تنظیمات مرورگر فعال کنید و دوباره تلاش کنید.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'میکروفونی پیدا نشد. اتصال میکروفون و تنظیمات دستگاه را بررسی کنید.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'میکروفون در دسترس نیست یا در برنامهٔ دیگری مشغول است. دوباره تلاش کنید.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'تنظیمات میکروفون با این دستگاه سازگار نیست. میکروفون دیگری را امتحان کنید.';
    case 'NotSupportedError':
      return 'این مرورگر قالب ضبط صدا را پشتیبانی نمی‌کند. مرورگر را به‌روز کنید.';
    default:
      return 'ضبط صدا انجام نشد. اتصال میکروفون را بررسی کنید و دوباره تلاش کنید.';
  }
}

function releaseMedia(current: Session) {
  if (current.released) return;
  current.released = true;
  if (current.timer !== null) window.clearInterval(current.timer);
  for (const track of current.stream.getTracks()) track.stop();
  void current.context?.close().catch(() => undefined);
}

/**
 * Waits for MediaRecorder's final data event, including when recording stops automatically.
 * Waveform analysis is optional; a browser that can record can still send a voice note.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' });
  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);

  const release = useCallback(() => {
    generation.current += 1;
    starting.current = false;
    const current = session.current;
    session.current = null;
    if (!current) return;
    current.recorder.ondataavailable = null;
    current.recorder.onstop = null;
    current.recorder.onerror = null;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    current.resolveStopped();
    releaseMedia(current);
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    if (session.current || starting.current) return;
    if (window.isSecureContext === false) {
      setState({ phase: 'error', message: 'برای ضبط صدا، برنامه را با HTTPS یا روی localhost باز کنید.' });
      return;
    }
    const Recorder = window.MediaRecorder;
    if (typeof Recorder !== 'function' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setState({ phase: 'error', message: 'این مرورگر ضبط صدا را پشتیبانی نمی‌کند. مرورگر را به‌روز کنید.' });
      return;
    }
    starting.current = true;
    const attempt = ++generation.current;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // A permission prompt can finish after cancel/unmount. Never activate its late stream.
      if (attempt !== generation.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const mimeType = typeof Recorder.isTypeSupported === 'function'
        ? MIME_TYPES.find((type) => Recorder.isTypeSupported(type))
        : undefined;
      const recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
      let analyser: AnalyserNode | null = null;
      // Safari versions may expose only webkitAudioContext; analysis must not gate capture.
      const Context = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      try {
        if (Context) {
          context = new Context();
          analyser = context.createAnalyser();
          analyser.fftSize = 512;
          context.createMediaStreamSource(stream).connect(analyser);
        }
      } catch {
        void context?.close().catch(() => undefined);
        context = null;
        analyser = null;
      }
      const samples = new Uint8Array(analyser?.fftSize ?? 0);
      let resolveStopped!: () => void;
      const stopped = new Promise<void>((resolve) => { resolveStopped = resolve; });
      const current: Session = {
        recorder, stream, context, chunks: [], levels: [], startedAt: performance.now(),
        stopped, resolveStopped, requestedMime: mimeType, stoppedAt: null, timer: null, released: false,
      };
      // Register once, before start/automatic stop: stop() can safely await an already-fired event.
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) current.chunks.push(event.data);
      };
      recorder.onstop = () => {
        current.stoppedAt = performance.now();
        releaseMedia(current);
        current.resolveStopped();
      };
      recorder.onerror = (event) => {
        setState({ phase: 'error', message: recordingError('error' in event ? event.error : event) });
        release();
      };
      session.current = current;
      recorder.start(250);
      current.timer = window.setInterval(() => {
        let level = 0;
        if (analyser) {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
          level = Math.sqrt(sum / samples.length);
          current.levels.push(level);
        }
        const seconds = Math.floor((performance.now() - current.startedAt) / 1000);
        setState({ phase: 'recording', seconds: Math.min(seconds, MAX_SECONDS), level });
        if (seconds >= MAX_SECONDS && recorder.state !== 'inactive') recorder.stop();
      }, SAMPLE_MS);
      setState({ phase: 'recording', seconds: 0, level: 0 });
    } catch (error) {
      if (attempt !== generation.current) return;
      if (session.current) release();
      else {
        for (const track of stream?.getTracks() ?? []) track.stop();
        void context?.close().catch(() => undefined);
      }
      setState({ phase: 'error', message: recordingError(error) });
    } finally {
      if (attempt === generation.current) starting.current = false;
    }
  }, [release]);

  const stop = useCallback(async (): Promise<Recorded | null> => {
    const current = session.current;
    if (!current) return null;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    await current.stopped;
    // A cancellation or a concurrent stop consumed the session while it was finalizing.
    if (session.current !== current) return null;
    const durationSec = Math.min(MAX_SECONDS, Math.round(((current.stoppedAt ?? performance.now()) - current.startedAt) / 1000));
    const mimeType = current.recorder.mimeType || current.chunks.find((chunk) => chunk.type)?.type || current.requestedMime;
    const blob = new Blob(current.chunks, { type: mimeType });
    const levels = [...current.levels];
    release();
    setState({ phase: 'idle' });
    if (durationSec < MIN_SECONDS || blob.size === 0) return null;
    if (!mimeType) {
      setState({ phase: 'error', message: 'قالب صدای ضبط‌شده مشخص نیست. مرورگر را به‌روز کنید و دوباره تلاش کنید.' });
      return null;
    }
    return { blob, durationSec, waveform: toWaveform(levels) };
  }, [release]);

  const cancel = useCallback(() => {
    release();
    setState({ phase: 'idle' });
  }, [release]);

  const dismissError = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, start, stop, cancel, dismissError };
}
