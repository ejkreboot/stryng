// stryng.ts
import * as Y from 'yjs';
import diff from 'fast-diff';
import type { YjsStore } from './yjs-store';
import { SupabaseStore } from './yjs-store'; // only if you use the supabase transport

// Extract constants from fast-diff default export
const { EQUAL, DELETE, INSERT } = diff as any;

type AnyProvider = { connect?: () => void | Promise<void>; disconnect?: () => void; destroy?: () => void };
type DeltaOp = { retain?: number; insert?: string; delete?: number; attributes?: Record<string, any> };

export interface StryngOpts {
  ydoc?: Y.Doc;
  key?: string;               // doc id; reused for IDB key
  initial?: string;


  // realtime (optional)
  transport?: 'websocket' | 'webrtc' | 'supabase' | null;
  room?: string;              // defaults to key
  websocket?: { url?: string; params?: Record<string,string> };
  webrtc?:    { signaling?: string[]; password?: string };
  provider?: AnyProvider;
  connect?: boolean;

  // persistence (cache) — BYO or let it default to y-indexeddb in browser
  persistence?: YjsStore | false;

  debounceMs?: number;
}

export class Stryng {
  #doc: Y.Doc;
  #text: Y.Text;
  #provider: AnyProvider | null = null;
  #ownDoc = false;

  #debounceMs: number;
  #debounceTimer?: ReturnType<typeof setTimeout>;

  // persistence choices
  #store?: YjsStore;                      // BYO cache (YjsStore)
  #idb?: any;                             // y-indexeddb IndexeddbPersistence instance
  #initialContentSet = false;

  constructor(opts: StryngOpts = {}) {
    const {
      ydoc, key = 'stryng', initial = '',
      provider, transport = null, room = key,
      persistence = undefined, connect = true,
      debounceMs = 0
    } = opts;

    this.#ownDoc = !ydoc;
    this.#doc = ydoc ?? new Y.Doc();
    this.#text = this.#doc.getText(key);
    this.#debounceMs = debounceMs;
    this.#provider = provider ?? null;

    // boot (persistence + transport), then consider initial content
    this.#initializeAsync({ ...opts, key, room, initial, persistence, transport, connect }).catch(err =>
      console.warn('[Stryng] init error:', err)
    );
  }

  get(): string { return this.#text.toString(); }
  get ydoc()  { return this.#doc; }
  get ytext() { return this.#text; }

  // ----- init -----
  async #initializeAsync(cfg: Required<Pick<StryngOpts, 'key' | 'room' | 'initial'>> & StryngOpts) {
    // 1) Persistence: BYO store → use it; false → none; undefined → default to y-indexeddb (browser only)
    await this.#setupPersistence(cfg);

    // 2) Transport (optional)
    if (!cfg.provider && cfg.transport && cfg.connect && typeof window !== 'undefined') {
      await this.#setupTransport(cfg.transport, cfg);
    } else if (cfg.provider) {
      this.#provider = cfg.provider;
      await this.#provider.connect?.();
    }

    // 3) Initial content (only if doc truly empty)
    // tiny delay so any “whenSynced”/initial loads land first
    setTimeout(() => this.#setInitialContentIfNeeded(cfg.initial), 50);
  }

  async #setupPersistence(cfg: Required<Pick<StryngOpts, 'key'>> & StryngOpts) {
    const hasWindow = typeof window !== 'undefined';
    const hasIDB = hasWindow && typeof indexedDB !== 'undefined';

    if (cfg.persistence === false) {
      // explicitly no cache
      return;
    }

    if (cfg.persistence) {
      // BYO cache (YjsStore)
      this.#store = cfg.persistence;

      const existing = await this.#store.load(cfg.key);
      if (existing) Y.applyUpdate(this.#doc, existing);

      // Persist only when using YjsStore; y-indexeddb listens to doc itself.
      this.#doc.on('update', (u, origin) => {
        if (origin === this.#store) return;
        this.#store?.saveUpdate(cfg.key, u).catch(console.warn);
      });

      // Optional: remote watch → apply incoming and feed into store (already handled by saveUpdate above on next local update)
      this.#store.watch?.(cfg.key, (u) => Y.applyUpdate(this.#doc, u));

      return;
    }

    // Default cache: y-indexeddb (browser only)
    if (hasIDB) {
      // lazy-import to avoid SSR bundling issues
      const { IndexeddbPersistence } = await import('y-indexeddb');
      this.#idb = new IndexeddbPersistence(cfg.key, this.#doc);
      await this.#idb.whenSynced.catch(() => {});
      // no update listener needed — y-indexeddb observes the doc and persists automatically
      return;
    }

    // No persistence available (SSR/Node)
  }

  async #setupTransport(kind: NonNullable<StryngOpts['transport']>, cfg: StryngOpts & { room: string }) {
    if (kind === 'webrtc') {
      throw new Error('Provide a WebRTC provider; public signaling not configured.');
    }

    if (kind === 'websocket') {
      const { WebsocketProvider } = await import('y-websocket');
      const url = cfg.websocket?.url ?? 'wss://ws.codyx.io/ws-codyx/';
      this.#provider = new WebsocketProvider(url, cfg.room, this.#doc, {
        params: cfg.websocket?.params ?? {}
      });
      // best-effort “ready”
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 3000);
        (this.#provider as any).on?.('sync', () => { clearTimeout(timeout); resolve(); });
      });
      return;
    }

    if (kind === 'supabase') {
      const { YSupabaseProvider } = await import('./y-supabase.js');
      // If you want to reuse the Supabase client from a SupabaseStore:
      let supabaseClient: any | undefined;
      if (this.#store instanceof SupabaseStore) {
        supabaseClient = (this.#store as any).sb; // expose client in your SupabaseStore for this to work
      }
      if (!supabaseClient) throw new Error('Supabase transport requires a Supabase client or SupabaseStore.');

      const prov = new YSupabaseProvider({
        doc: this.#doc,
        room: cfg.room,
        supabase: supabaseClient,
        selfBroadcast: false
      });
      await prov.connect();
      this.#provider = prov;
      return;
    }

    throw new Error(`Unknown transport "${kind}"`);
  }

  #setInitialContentIfNeeded(initial: string) {
    if (!this.#initialContentSet && initial && this.#text.length === 0) {
      this.#doc.transact(() => this.#text.insert(0, initial));
      this.#initialContentSet = true;
    }
  }

  // ----- editing -----
  async update(next: string, debounceMs = this.#debounceMs): Promise<void> {
    if (debounceMs > 0) {
      clearTimeout(this.#debounceTimer);
      await new Promise<void>(resolve => {
        this.#debounceTimer = setTimeout(() => { this.#applyDiff(next); resolve(); }, debounceMs);
      });
    } else {
      this.#applyDiff(next);
    }
  }

  #coalesce(delta: DeltaOp[]): DeltaOp[] {
    if (!delta.length) return delta;
    const out: DeltaOp[] = [];
    for (const op of delta) {
      const last = out[out.length - 1];
      if (op.retain && last?.retain) last.retain += op.retain;
      else if (op.delete && last?.delete) last.delete += op.delete;
      else if (op.insert && last?.insert) last.insert += op.insert;
      else out.push(op);
    }
    return out;
  }

  #fromFastDiff(ops: ReadonlyArray<[number, string]>): DeltaOp[] {
    const delta: DeltaOp[] = [];
    for (const [t, s] of ops) {
      if (t === EQUAL)       delta.push({ retain: s.length });
      else if (t === DELETE) delta.push({ delete: s.length });
      else if (t === INSERT) delta.push({ insert: s });
    }
    return this.#coalesce(delta);
  }

  #applyDiff(next: string) {
    const prev = this.#text.toString();
    if (next === prev) return;

    const ops = diff(prev, next);
    const edited = ops.reduce((n, [t, s]) => n + (t === EQUAL ? 0 : s.length), 0);
    const denom  = Math.max(prev.length, next.length, 1);

    if (edited / denom > 0.6) {
      this.#doc.transact(() => {
        this.#text.delete(0, this.#text.length);
        if (next) this.#text.insert(0, next);
      });
      return;
    }

    const delta = this.#fromFastDiff(ops);
    this.#doc.transact(() => this.#text.applyDelta(delta));
  }

  // ----- observation / lifecycle -----
  onChange(fn: (t: string) => void) {
    const obs = () => fn(this.#text.toString());
    this.#text.observe(obs);
    fn(this.get());
    return () => this.#text.unobserve(obs);
  }

  disconnect() { this.#provider?.disconnect?.(); }

  destroy() {
    clearTimeout(this.#debounceTimer);
    this.#store?.close?.();
    try { this.#provider?.destroy?.(); } catch {}
    if (this.#ownDoc) this.#doc.destroy();
  }

  // callable + awaitable convenience
  static create(opts: StryngOpts = {}) {
    const core = new Stryng(opts);
    const f = (async (next?: string) => {
      if (arguments.length) await core.update(String(next));
      return core.get();
    }) as any;

    Object.defineProperty(f, 'subscribe', { value: (fn: (t: string) => void) => core.onChange(fn) });
    Object.defineProperty(f, 'destroy',   { value: () => core.destroy() });
    Object.defineProperty(f, 'toString',  { value: () => core.get() });
    Object.defineProperty(f, Symbol.toPrimitive, { value: () => core.get() });

    return Object.freeze(f);
  }
}
