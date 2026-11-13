import { afterEach, describe, expect, it, vi } from 'vitest';

const { handlers, socket } = vi.hoisted(() => {
  const handlers = new Map<string, (error: { data: { code: string } }) => void>();
  return {
    handlers,
    socket: {
      connected: false,
      on: vi.fn((name: string, callback: (error: { data: { code: string } }) => void) =>
        handlers.set(name, callback),
      ),
      onAny: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  };
});
vi.mock('socket.io-client', () => ({ io: () => socket }));
import { RealtimeClient } from '@/api/realtime';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  handlers.clear();
});

describe('expired socket session refresh', () => {
  it.each(['valid', 'invalid', 'unavailable'] as const)(
    'reconnects only as appropriate for a %s refresh check',
    async (result) => {
      vi.useFakeTimers();
      vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
      const refreshToken =
        result === 'unavailable'
          ? vi.fn().mockRejectedValue(new Error('temporary outage'))
          : vi.fn().mockResolvedValue(result === 'valid');
      const onRejected = vi.fn();
      const client = new RealtimeClient({
        token: () => 'synthetic',
        onEvent: vi.fn(),
        onStatus: vi.fn(),
        resumeFrom: () => null,
        onResumed: vi.fn(),
        onRejected,
        refreshToken,
      });
      client.connect(null);
      handlers.get('connect_error')!({ data: { code: 'AUTH_EXPIRED' } });
      await vi.runAllTimersAsync();
      expect(refreshToken).toHaveBeenCalledOnce();
      expect(onRejected).toHaveBeenCalledTimes(result === 'invalid' ? 1 : 0);
      expect(socket.connect).toHaveBeenCalledTimes(result === 'invalid' ? 0 : 1);
      client.disconnect();
    },
  );
});
