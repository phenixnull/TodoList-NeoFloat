import { normalizeServerUrl } from './api';

export type RealtimeEvent = {
  event: string;
  data: Record<string, unknown>;
};

export type RealtimeStatus = 'connecting' | 'open' | 'offline';

type Connection = {
  close: () => void;
};

/**
 * Minimal SSE client over XMLHttpRequest. React Native has no EventSource and
 * fetch body streams are unreliable, but XHR exposes partial responseText via
 * onprogress as the stream arrives, which is enough to parse SSE frames.
 */
export function connectRealtime(
  serverUrl: string,
  handlers: {
    onEvent: (event: RealtimeEvent) => void;
    onStatus?: (status: RealtimeStatus) => void;
  },
): Connection {
  const base = normalizeServerUrl(serverUrl);
  let closed = false;
  let xhr: XMLHttpRequest | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1000;
  let consumed = 0;
  let dataBuffer: string[] = [];
  let eventName = 'message';

  const dispatch = () => {
    if (dataBuffer.length) {
      const payload = dataBuffer.join('\n');
      dataBuffer = [];
      if (payload) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
        handlers.onEvent({ event: eventName, data: parsed });
      }
    }
    eventName = 'message';
  };

  const processChunk = (chunk: string) => {
    const lines = chunk.split('\n');
    for (const raw of lines) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (line === '') {
        dispatch();
      } else if (line.startsWith(':')) {
        // comment / heartbeat, ignore
      } else if (line.startsWith('data:')) {
        dataBuffer.push(line.slice(5).trimStart());
      } else if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      }
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    handlers.onStatus?.('offline');
    reconnectTimer = setTimeout(() => {
      connect();
    }, backoff);
    backoff = Math.min(backoff * 2, 15_000);
  };

  const connect = () => {
    if (closed) return;
    // Environments without XHR (some test runtimes) degrade to pull-only.
    if (typeof XMLHttpRequest === 'undefined') return;
    handlers.onStatus?.('connecting');
    const request = new XMLHttpRequest();
    xhr = request;
    consumed = 0;
    request.open('GET', `${base}/api/events`, true);
    request.setRequestHeader('Accept', 'text/event-stream');
    request.timeout = 0;

    request.onprogress = () => {
      const text = request.responseText ?? '';
      if (text.length > consumed) {
        processChunk(text.slice(consumed));
        consumed = text.length;
        backoff = 1000;
        handlers.onStatus?.('open');
      }
    };

    request.onerror = () => scheduleReconnect();
    request.onload = () => {
      // Stream ended cleanly (server restart). Reconnect immediately.
      scheduleReconnect();
    };

    request.send();
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (xhr) {
        xhr.onprogress = null;
        xhr.onerror = null;
        xhr.onload = null;
        xhr.abort();
      }
    },
  };
}
