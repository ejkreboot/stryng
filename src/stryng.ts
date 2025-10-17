// stryng.ts
import * as Y from 'yjs';
import diff from 'fast-diff';
import { YSupabaseProvider } from './y-supabase';

type AnyProvider = { connect?: () => void | Promise<void>; disconnect?: () => void; destroy?: () => void };

export type StryngOpts = {
  ydoc?: Y.Doc;
  key?: string;
  initial?: string;

  transport?: 'webrtc' | 'websocket' | 'supabase';
  room?: string;
  indexeddb?: boolean;
  connect?: boolean;

  webrtc?: { signaling?: string[]; password?: string };
  websocket?: { url?: string; params?: Record<string,string> };
  supabase?: { client?: any; url?: string; anonKey?: string; selfBroadcast?: boolean };

  provider?: AnyProvider;    // if passed, Stryng won’t create its own
  debounceMs?: number;
};

export class Stryng {
  #doc: Y.Doc;
  #text: Y.Text;
  #provider: AnyProvider | null = null;
  #ownDoc = false;
  #debounceMs: number;
  #debounceTimer?: ReturnType<typeof setTimeout>;
  #indexeddbProvider?: any;

  constructor(opts: StryngOpts = {}) {
    const {
      ydoc, key = 'stryng', initial = '',
      provider, transport = 'webrtc', room = key,
      indexeddb = true, connect = true,
      debounceMs = 0
    } = opts;

    this.#ownDoc = !ydoc;
    this.#doc = ydoc ?? new Y.Doc();
    this.#text = this.#doc.getText(key);
    this.#debounceMs = debounceMs;
    this.#provider = provider ?? null;

    if (this.#text.length === 0 && initial) {
      this.#doc.transact(() => this.#text.insert(0, initial));
    }

    if (this.#ownDoc && indexeddb && typeof window !== 'undefined') {
      import('y-indexeddb')
        .then(({ IndexeddbPersistence }) => {
          this.#indexeddbProvider = new IndexeddbPersistence(room, this.#doc);
        })
        .catch((e) => {
          console.warn('[Stryng] IndexedDB setup failed:', e);
        });
    }

    if (this.#ownDoc && !provider && connect && typeof window !== 'undefined') {
      this.#attachDefaultProvider(transport, { ...opts, room }).catch((e) => {
        console.warn('[Stryng] Failed to attach default provider:', e);
      });
    }
  }

  async #attachDefaultProvider(kind: NonNullable<StryngOpts['transport']>, cfg: StryngOpts & { room: string }) {
    if (kind === 'webrtc') {
      try {
        const { WebrtcProvider } = await import('y-webrtc');
        this.#provider = new WebrtcProvider(cfg.room, this.#doc, {
          signaling: cfg.webrtc?.signaling ?? [
            'wss://signaling.yjs.dev',
            'wss://y-webrtc-signaling-eu.herokuapp.com',
            'wss://y-webrtc-signaling-us.herokuapp.com'
          ],
          password: cfg.webrtc?.password
        });
      } catch (e) {
        throw new Error(
          'Stryng: transport "webrtc" requires the optional dependency "y-webrtc". ' +
          'Install it in your app: npm i y-webrtc'
        );
      }
      return;
    }

    if (kind === 'websocket') {
      try {
        const { WebsocketProvider } = await import('y-websocket');
        const url = cfg.websocket?.url ?? 'wss://demos.yjs.dev';
        this.#provider = new WebsocketProvider(url, cfg.room, this.#doc, {
          params: cfg.websocket?.params ?? {}
        });
      } catch (e) {
        throw new Error(
          'Stryng: transport "websocket" requires "y-websocket". Install: npm i y-websocket'
        );
      }
      return;
    }

    if (kind === 'supabase') {
      try {
        const { YSupabaseProvider } = await import('./y-supabase.js'); // your provider
        const prov = new YSupabaseProvider({
          doc: this.#doc,
          room: cfg.room,
          supabase: cfg.supabase?.client,
          url: cfg.supabase?.url,
          anonKey: cfg.supabase?.anonKey,
          selfBroadcast: cfg.supabase?.selfBroadcast
        });
        await prov.connect();
        this.#provider = prov;
      } catch (e) {
        throw new Error(
          'Stryng: transport "supabase" requires "@supabase/supabase-js". Install: npm i @supabase/supabase-js'
        );
      }
      return;
    }
  }
  
  get(): string { return this.#text.toString(); }

  async update(next: string, debounceMs = this.#debounceMs): Promise<void> {
    console.log("updateing to:", next, "with debounceMs:", debounceMs);
    if (debounceMs > 0) {
      clearTimeout(this.#debounceTimer);
      await new Promise<void>(resolve => {
        this.#debounceTimer = setTimeout(() => { this.#applyDiff(next); resolve(); }, debounceMs);
      });
    } else {
      this.#applyDiff(next);
    }
  }

  #applyDiff(next: string) {
    const prev = this.#text.toString();
    if (next === prev) return;

    const ops = diff(prev, next);
    const edits = ops.reduce((n, [t, s]) => n + (t ? (s as string).length : 0), 0);
    if (prev.length && edits / Math.max(prev.length, 1) > 0.6) {
      this.#doc.transact(() => { this.#text.delete(0, this.#text.length); if (next) this.#text.insert(0, next); });
      return;
    }

    let cursor = 0;
    this.#doc.transact(() => {
      for (const [t, s] of ops) {
        if (t === diff.EQUAL) { cursor += (s as string).length; continue; }
        if (t === diff.DELETE) { this.#text.delete(cursor, (s as string).length); continue; }
        if (t === diff.INSERT) { this.#text.insert(cursor, s as string); cursor += (s as string).length; }
      }
    });
  }

  onChange(fn: (t: string) => void) {
    const obs = () => fn(this.#text.toString());
    this.#text.observe(obs);
    fn(this.get());
    return () => this.#text.unobserve(obs);
  }

  disconnect() { this.#provider?.disconnect?.(); }
  destroy() { 
    clearTimeout(this.#debounceTimer);
    this.#indexeddbProvider?.destroy?.(); 
    try { this.#provider?.destroy?.(); } catch {}; 
    if (this.#ownDoc) this.#doc.destroy(); 
  }

  get ydoc()  { return this.#doc; }
  get ytext() { return this.#text; }

  // callable + awaitable handle
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
