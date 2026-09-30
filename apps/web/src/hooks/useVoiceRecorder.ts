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

/** Resamples loudness readings to `points` bars scaled to 0–100 (the loudest bar is 100). */
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

/**
 * Records a voice note with the browser's MediaRecorder, sampling its loudness through an
 * AnalyserNode for the waveform. `stop()` resolves with the recording (or `null` when it was too
 * short); `cancel()` throws it away. The microphone is released either way.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' });
  const session = useRef<{
    readonly recorder: MediaRecorder;
    readonly stream: MediaStream;
    readonly context: AudioContext;
    readonly chunks: Blob[];
    readonly levels: number[];
    readonly startedAt: number;
    readonly timer: number;
  } | null>(null);

  const release = useCallback(() => {
    const current = session.current;
    if (!current) return;
    window.clearInterval(current.timer);
    for (const track of current.stream.getTracks()) track.stop();
    void current.context.close().catch(() => undefined);
    session.current = null;
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    if (session.current) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ phase: 'error', message: 'این مرورگر ضبط صدا را پشتیبانی نمی‌کند.' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ phase: 'error', message: 'دسترسی به میکروفون داده نشد.' });
      return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const chunks: Blob[] = [];
    const levels: number[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const level = Math.sqrt(sum / samples.length);
      levels.push(level);
      const seconds = Math.floor((performance.now() - startedAt) / 1000);
      setState({ phase: 'recording', seconds, level });
      if (seconds >= MAX_SECONDS) recorder.stop();
    }, SAMPLE_MS);
    recorder.start(250);
    session.current = { recorder, stream, context, chunks, levels, startedAt, timer };
    setState({ phase: 'recording', seconds: 0, level: 0 });
  }, []);

  const stop = useCallback(async (): Promise<Recorded | null> => {
    const current = session.current;
    if (!current) return null;
    const stopped = new Promise<void>((resolve) => {
      current.recorder.onstop = () => resolve();
    });
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    await stopped;
    const durationSec = Math.round((performance.now() - current.startedAt) / 1000);
    const blob = new Blob(current.chunks, { type: current.recorder.mimeType || 'audio/webm' });
    const levels = [...current.levels];
    release();
    setState({ phase: 'idle' });
    if (durationSec < MIN_SECONDS || blob.size === 0) return null;
    return { blob, durationSec, waveform: toWaveform(levels) };
  }, [release]);

  const cancel = useCallback(() => {
    const current = session.current;
    if (current && current.recorder.state !== 'inactive') {
      current.recorder.onstop = null;
      current.recorder.stop();
    }
    release();
    setState({ phase: 'idle' });
  }, [release]);

  const dismissError = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, start, stop, cancel, dismissError };
}
