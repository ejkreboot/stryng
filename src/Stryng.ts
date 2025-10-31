
import * as Y from 'yjs';
import diff from 'fast-diff';
import { Realtime, RealtimeProvider, WebsocketRealtime, SupabaseRealtime } from './realtime';
import { PersistenceProvider, PersistenceEvent, SupabasePersistence } from './persistence';

type DeltaOp = { retain?: number; insert?: string; delete?: number; attributes?: Record<string, any> };
export type ChangeEvent = { source: 'local' | 'remote'; delta?: DeltaOp[]; value: string };
export type PersistenceChangeEvent = PersistenceEvent;
const { EQUAL, DELETE, INSERT } = diff as any;

type StryngOptions = {
  value?: string;
  doc?: Y.Doc;
  serverUrl?: string;
  room?: string;
  token?: string | null;
  onChange?: (change: ChangeEvent) => void;
  onPersistence?: (event: PersistenceChangeEvent) => void;
  log?: boolean;
  provider?: RealtimeProvider;
  /** Enable database persistence */
  persistence?: boolean | 'supabase';
  /** Document ID for persistence (defaults to room name) */
  docId?: string;
  /** Persistence options */
  persistenceOptions?: {
    saveInterval?: number;
    autoSave?: boolean;
    autoLoad?: boolean;
  };
};

const noop = () => {};

export class Stryng {
  private doc: Y.Doc;
  private text: Y.Text;
  private provider!: Realtime;
  private persistence?: PersistenceProvider;
  private _resolveOnConnect!: () => void;

  readonly key: string;
  ready: Promise<void>;
  onChange: (change: ChangeEvent) => void;
  onPersistence: (event: PersistenceChangeEvent) => void;

  constructor({
    value = '',
    doc = new Y.Doc(),
    onChange = noop,
    onPersistence = noop,
    log = false,
    provider,
    persistence,
    docId,
    persistenceOptions,
    room,
    serverUrl,
    token
  }: StryngOptions = {}) {

    this.doc = doc;
    this.text = this.doc.getText('stryng');
    this.key = `stryng-${Math.random().toString(36).slice(2, 9)}`;
    this.onChange = onChange;
    this.onPersistence = onPersistence;

    // Choose a realtime provider:
    if (provider == "websocket") {
        this.provider = new WebsocketRealtime(this.doc, { serverUrl, room, token });
    } else if (provider == "supabase") {
        this.provider = new SupabaseRealtime(this.doc, { serverUrl, room, token }); 
    }

    // Initialize persistence if requested
    if (persistence) {
      this.initializePersistence(persistence, docId || room, persistenceOptions, { 
        serverUrl, 
        token: token || undefined 
      });
    }

    this.ready = new Promise<void>((r) => (this._resolveOnConnect = r));
    
    // Handle realtime connection status
    this.provider?.onStatus((e) => {
      if (log) console.log(`[stryng] realtime ${e.status}`);
      if (e.status === 'connected') {
        this.onRealtimeConnected(value);
      }
    });

    this.text.observe((event, txn) => {
      if (log) console.log('[stryng] delta:', event.delta);
      this._emit(txn.local ? 'local' : 'remote', event.delta as DeltaOp[]);
    });
  }

  static create(value = '', 
                onChange: (c: ChangeEvent) => void = noop, 
                opts: Partial<StryngOptions> = {}) {
    const instance = new Stryng({ value, onChange, ...opts });
    return instance;
  }

  /** 
   * Create a Stryng instance with persistence enabled
   */
  static async createWithPersistence(
    docId: string,
    value = '',
    onChange: (c: ChangeEvent) => void = noop,
    onPersistence: (e: PersistenceChangeEvent) => void = noop,
    opts: Partial<StryngOptions> = {}
  ) {
    const instance = new Stryng({ 
      value, 
      onChange, 
      onPersistence,
      docId,
      persistence: 'supabase',
      ...opts 
    });
    
    // Wait for both realtime and persistence to be ready
    await instance.ready;
    return instance;
  }

  get(): string {
    return this.text.toString();
  }

  async update(newValue: string): Promise<void> {
    if (newValue === this.get()) return;
    this.doc.transact(() => {
      const delta = this.#fastDiffToDelta(this.get(), newValue);
      if (delta !== 'replace') {
        this.text.applyDelta(delta);
        return;
      }
      this.text.delete(0, this.text.length);
      this.text.insert(0, newValue);
    }, 'local');
  }

  destroy(): void {
    this.provider?.destroy();
    this.persistence?.destroy();
    this.doc.destroy();
  }

  /**
   * Manually save document to database (if persistence is enabled)
   */
  async save(): Promise<void> {
    if (!this.persistence) {
      throw new Error('Persistence is not enabled');
    }
    await this.persistence.saveDocument();
  }

  /**
   * Manually load document from database (if persistence is enabled)
   */
  async load(): Promise<boolean> {
    if (!this.persistence) {
      throw new Error('Persistence is not enabled');
    }
    const docId = this.persistence['opts'].docId;
    if (!docId) {
      throw new Error('Document ID is required for loading');
    }
    return await this.persistence.loadDocument(docId);
  }

  /**
   * Get persistence status
   */
  getPersistenceStatus() {
    return this.persistence?.getStatus() || 'idle';
  }

  private async initializePersistence(
    persistence: boolean | 'supabase', 
    docId?: string, 
    persistenceOptions?: StryngOptions['persistenceOptions'],
    providerOpts?: { serverUrl?: string; token?: string }
  ): Promise<void> {
    if (!docId) {
      throw new Error('Document ID is required for persistence');
    }

    const opts = {
      docId,
      ...persistenceOptions
    };

    if (persistence === true || persistence === 'supabase') {
      this.persistence = new SupabasePersistence(this.doc, {
        ...opts,
        serverUrl: providerOpts?.serverUrl,
        token: providerOpts?.token
      });

      // Forward persistence events
      this.persistence.onStatus((event) => {
        this.onPersistence(event);
      });

      // Initialize persistence (load existing document if autoLoad is enabled)
      try {
        await this.persistence.initialize(docId);
      } catch (error) {
        console.error('Failed to initialize persistence:', error);
        // Don't throw - let the app continue without persistence
      }
    }
  }

  private async onRealtimeConnected(initialValue?: string): Promise<void> {
    // If we have persistence, load from database first
    if (this.persistence) {
      try {
        const loaded = await this.load();
        if (loaded) {
          // Document was loaded from database, resolve ready promise
          this._resolveOnConnect();
          return;
        }
      } catch (error) {
        console.error('Failed to load from database:', error);
        // Continue with normal initialization
      }
    }

    // No persistence or loading failed - use initial value if text is empty
    if (this.text.length === 0 && initialValue) {
      this.doc.transact(() => this.text.insert(0, initialValue));
    }
    
    this._resolveOnConnect();
  }

  private _emit(source: 'local' | 'remote', delta: DeltaOp[]) {
    this.onChange?.({ source, delta, value: this.get() });
  }

  #coalesceDelta(delta: DeltaOp[]): DeltaOp[] {
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

  #fastDiffToDelta(prev: string, next: string): DeltaOp[] | 'replace' {
    if (prev === next) return [];
    const ops = diff(prev, next) as ReadonlyArray<[number, string]>;
    const edited = ops.reduce((n, [t, s]) => n + (t === EQUAL ? 0 : s.length), 0);
    const denom = Math.max(prev.length, next.length, 1);
    if (edited / denom > 0.6) return 'replace';
    const delta: DeltaOp[] = [];
    for (const [t, s] of ops) {
      if (t === EQUAL) delta.push({ retain: s.length });
      else if (t === DELETE) delta.push({ delete: s.length });
      else if (t === INSERT) delta.push({ insert: s });
    }
    return this.#coalesceDelta(delta);
  }
}
