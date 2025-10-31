import * as Y from 'yjs';

export type ProviderStatus = 'connecting' | 'connected' | 'disconnected';
export type StatusEvent = { status: ProviderStatus };

export type ProviderOptions = {
  serverUrl?: string;
  room?: string;
  token?: string | null;
};

export interface RealtimeProviderRegistry {
  none: true;
  websocket: true;
  supabase: true;
}

export type RealtimeProvider = keyof RealtimeProviderRegistry;

// Persistence types
export interface PersistenceProviderRegistry {
  none: false;
  supabase: true;
}

export type PersistenceProviderType = keyof PersistenceProviderRegistry;

export abstract class Realtime {
  protected readonly statusCbs = new Set<(e: StatusEvent) => void>();
  private onDocUpdate?: (u: Uint8Array) => void;

  constructor(
    public readonly doc: Y.Doc,
    protected readonly opts: Readonly<Partial<ProviderOptions>> = {}
  ) {
    // Base wires local updates to the transport; child only implements sendUpdate
    this.onDocUpdate = (u) => this.sendUpdate(u);
    this.doc.on('update', this.onDocUpdate);
  }

  /** Providers must put local updates on the wire. */
  protected abstract sendUpdate(update: Uint8Array): void;

  /** Providers call this when they receive a remote update. */
  protected applyRemote(update: Uint8Array) {
    Y.applyUpdate(this.doc, update);
  }

  /** Optional: providers that need a one-shot handshake can override. */
  syncOnce?(): void;

  /** Optional lifecycle if you don’t want network side effects in the constructor. */
  connect?(): void;
  disconnect?(): void;

  onStatus(cb: (e: StatusEvent) => void): void {
    this.statusCbs.add(cb);
  }

  protected emitStatus(status: ProviderStatus) {
    const evt = { status } as const;
    for (const cb of this.statusCbs) cb(evt);
  }

  /** Free any resources/sockets. */
  destroy(): void {
    // let child clean up IO
    this.disconnect?.();
    if (this.onDocUpdate) this.doc.off('update', this.onDocUpdate);
    this.statusCbs.clear();
  }
}
