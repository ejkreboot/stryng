// WebsocketRealtime.ts
import * as Y from 'yjs';
import { WebsocketProvider as YWebsocketProvider } from 'y-websocket';
import { Realtime, ProviderOptions, ProviderStatus } from './RealtimeProvider';

const DEFAULTS = {
  serverUrl: 'wss://ws.codyx.io/ws-codyx/',
  room: 'stryng-room',
  token: 'rjKfn9aBIjhTgrVV',
} as const;

type WebsocketOpts = Pick<ProviderOptions, 'serverUrl' | 'room' | 'token'>;

export class WebsocketRealtime extends Realtime {
  private inner: YWebsocketProvider;

  constructor(doc: Y.Doc, opts: Partial<WebsocketOpts> = {}) {
    super(doc, opts);

    const {
      serverUrl = DEFAULTS.serverUrl,
      room = DEFAULTS.room,
      token = DEFAULTS.token,
    } = opts;

    this.inner = new YWebsocketProvider(serverUrl, room, doc, {
      params: token ? { token } : undefined,
    });

    // Bridge provider status -> base status
    this.inner.on('status', (e: { status: string }) => {
      const s = e?.status as ProviderStatus | undefined;
      if (s === 'connected' || s === 'disconnected') this.emitStatus(s);
    });
  }

  /** y-websocket already sends local updates; we intentionally do nothing. */
  protected sendUpdate(_update: Uint8Array): void {
    // no-op
  }

  /** Optional lifecycle: pass-throughs */
  connect(): void {
    // y-websocket doesn't emit "connecting", so we can emit it here for consistency
    this.emitStatus('connecting');
    (this.inner as any).connect?.();
  }

  disconnect(): void {
    (this.inner as any).disconnect?.();
    this.emitStatus('disconnected');
  }

  destroy(): void {
    this.inner.destroy();
    super.destroy();
  }
}
