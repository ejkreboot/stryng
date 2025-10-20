import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

export type Unsubscribe = () => void;
type B64 = string;
type Meta = { ts?: number; actorId?: string };

const DB_NAME = 'stryng';
const DB_VER  = 1;
const DOCS    = 'documents';
const UPDS    = 'updates';

export interface YjsStore {
    // Return a merged doc state (preferred) or a concatenated update chain
    load(docId: string): Promise<Uint8Array | null>;
    
    // Append or upsert a Yjs update (binary)
    saveUpdate(docId: string, update: Uint8Array, meta?: { ts?: number; actorId?: string }): Promise<void>;
    
    // Optional: push-style updates from remote storage
    watch?(docId: string, onUpdate: (update: Uint8Array, meta?: any) => void): Unsubscribe;
    
    // Optional: snapshots for compaction
    getSnapshot?(docId: string): Promise<Uint8Array | null>;
    saveSnapshot?(docId: string, snapshot: Uint8Array, meta?: { ts?: number }): Promise<void>;
    
    // Optional: lifecycle
    close?(): void | Promise<void>;
}

// utility helpers
const isNode = typeof Buffer !== 'undefined';

export function toB64(u8: Uint8Array) {
    return isNode ? Buffer.from(u8).toString('base64')
    : btoa(String.fromCharCode(...u8));
}

export function fromB64(b64: string) {
    return isNode ? new Uint8Array(Buffer.from(b64, 'base64'))
    : Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export class MemoryStore implements YjsStore {
    private updates = new Map<string, Uint8Array[]>();
    
    async load(id: string) {
        const list = this.updates.get(id);
        if (!list?.length) return null;
        // Merge all updates into one state vector
        const doc = new Y.Doc();
        list.forEach(u => Y.applyUpdate(doc, u));
        return Y.encodeStateAsUpdate(doc);
    }
    
    async saveUpdate(id: string, u: Uint8Array) {
        const list = this.updates.get(id) ?? [];
        list.push(u);
        this.updates.set(id, list);
    }
}

export class LocalStorageStore implements YjsStore {
    private keyFor(id: string) { return `stryng:${id}`; }
    
    async load(id: string) {
        const b64 = localStorage.getItem(this.keyFor(id));
        return b64 ? fromB64(b64) : null;
    }
    
    async saveUpdate(id: string, u: Uint8Array) {
        // Merge into a doc each time (simple but not the most efficient)
        const current = await this.load(id);
        const doc = new Y.Doc();
        if (current) Y.applyUpdate(doc, current);
        Y.applyUpdate(doc, u);
        const merged = Y.encodeStateAsUpdate(doc);
        localStorage.setItem(this.keyFor(id), toB64(merged));
    }
}

export type SupabaseStoreOpts = {
    client?: SupabaseClient;           // pass an existing client OR url/anonKey
    url?: string;
    anonKey?: string;
    schema?: string;                   // default 'public'
    documentsTable?: string;           // default 'documents'
    updatesTable?: string;             // default 'doc_updates'
    realtime?: boolean;                // default false (enable watch)
};

export class SupabaseStore implements YjsStore {
    private sb: SupabaseClient;
    private schema: string;
    private documents: string;
    private updates: string;
    private rt?: { channel: ReturnType<SupabaseClient['channel']> } | null;
    
    constructor(opts: SupabaseStoreOpts) {
        this.sb = opts.client ?? createClient(opts.url!, opts.anonKey!);
        this.schema = opts.schema ?? 'public';
        this.documents = opts.documentsTable ?? 'documents';
        this.updates = opts.updatesTable ?? 'doc_updates';
        this.rt = null;
        // NOTE: leave realtime off unless you explicitly turn it on via watch()
    }
    
    async load(docId: string): Promise<Uint8Array | null> {
        // 1) Fetch snapshot (if any)
        const { data: snapRow, error: snapErr } = await this.sb
        .from(this.documents)
        .select('snapshot, snapshot_seq')
        .eq('id', docId)
        .maybeSingle();
        
        if (snapErr) throw snapErr;
        
        const doc = new Y.Doc();
        let fromSeq = 0n;
        
        if (snapRow?.snapshot) {
            const snap = fromB64(snapRow.snapshot as string); // Supabase returns base64 for bytea
            Y.applyUpdate(doc, snap);
            const seqVal = snapRow?.snapshot_seq;
            fromSeq = seqVal ? BigInt(seqVal) : 0n;
        }
        
        // 2) Fetch updates after snapshot
        const { data: updates, error: updErr } = await this.sb
        .from(this.updates)
        .select('seq, update')
        .eq('id', docId)
        .gt('seq', fromSeq.toString())   // PostgREST expects string for bigint compare
        .order('seq', { ascending: true });
        
        if (updErr) throw updErr;
        
        if (updates?.length) {
            for (const row of updates) {
                const u = fromB64(row.update as string);
                Y.applyUpdate(doc, u);
            }
        }
        
        // Return merged state as a single update (compact)
        const merged = Y.encodeStateAsUpdate(doc);
        return merged.length ? merged : null;
    }
    
    async saveUpdate(docId: string, update: Uint8Array, meta?: { ts?: number; actorId?: string }): Promise<void> {
        const payload = {
            id: docId,
            update: toB64(update),   // bytea via base64
            actor: meta?.actorId ?? null,
            ts: meta?.ts ? new Date(meta.ts).toISOString() : new Date().toISOString(),
        };
        
        const { error } = await this.sb.from(this.updates).insert(payload);
        if (error) throw error;
        
        // Touch documents.updated_at for convenience (optional)
        await this.sb.from(this.documents)
        .upsert({ id: docId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    }
    
    async getSnapshot(docId: string): Promise<Uint8Array | null> {
        const { data, error } = await this.sb
        .from(this.documents)
        .select('snapshot')
        .eq('id', docId)
        .maybeSingle();
        if (error) throw error;
        if (!data?.snapshot) return null;
        return fromB64(data.snapshot as string);
    }
    
    async saveSnapshot(docId: string, snapshot: Uint8Array, meta?: { ts?: number; seq?: number }): Promise<void> {
        // Compute latest seq if not provided
        let latestSeq = meta?.seq;
        if (latestSeq == null) {
            const { data, error } = await this.sb
            .from(this.updates)
            .select('seq')
            .eq('id', docId)
            .order('seq', { ascending: false })
            .limit(1);
            if (error) throw error;
            latestSeq = data?.[0]?.seq ?? null;
        }
        
        const row = {
            id: docId,
            snapshot: toB64(snapshot),
            snapshot_seq: latestSeq,
            updated_at: (meta?.ts ? new Date(meta.ts) : new Date()).toISOString(),
        };
        
        const { error } = await this.sb.from(this.documents).upsert(row, { onConflict: 'id' });
        if (error) throw error;
    }
    
    // Storage-driven realtime (optional)
    watch(docId: string, onUpdate: (update: Uint8Array, meta?: any) => void): Unsubscribe {
        // NOTE: requires a SELECT policy on doc_updates for your client key
        const ch = this.sb.channel(`doc_updates:${docId}`);
        
        ch.on(
            'postgres_changes',
            { event: 'INSERT', schema: this.schema, table: this.updates, filter: `id=eq.${docId}` },
            (payload) => {
                const row = payload.new as { update: B64; actor?: string; seq: number; ts?: string };
                const u8 = fromB64(row.update);
                onUpdate(u8, { actorId: row.actor, seq: row.seq, ts: row.ts });
            }
        ).subscribe();
        
        this.rt = { channel: ch };
        
        return () => {
            ch.unsubscribe();
            this.rt = null;
        };
    }
    
    async close() {
        // no-op; channel unsubscribed by watch()’s return fn
    }
}

export class YIndexedDBStore implements YjsStore {
    #idb?: IndexeddbPersistence;
    #doc: Y.Doc;
    #key: string;
    
    constructor(key: string, doc: Y.Doc) {
        if (typeof indexedDB === 'undefined') {
            throw new Error('IndexedDB not available in this environment');
        }
        this.#key = key;
        this.#doc = doc;
        this.#idb = new IndexeddbPersistence(key, doc);
    }
    
    async load(): Promise<Uint8Array | null> {
        // Wait until IDB state (if any) is applied into the doc
        await this.#idb!.whenSynced;
        const merged = Y.encodeStateAsUpdate(this.#doc);
        return merged.length ? merged : null;
    }
    
    async saveUpdate(_id: string, _u: Uint8Array): Promise<void> {
        /* no-op */
    }
    
    // Cross-tab updates are already applied to the same Y.Doc by y-indexeddb.
    // If your Stryng expects a watch callback, you can forward doc updates:
    watch?(_id: string, onUpdate: (u: Uint8Array) => void) {
        const handler = (u: Uint8Array) => onUpdate(u);
        this.#doc.on('update', handler);
        return () => this.#doc.off('update', handler);
    }
    
    async getSnapshot(): Promise<Uint8Array | null> {
        await this.#idb!.whenSynced;
        const merged = Y.encodeStateAsUpdate(this.#doc);
        return merged.length ? merged : null;
    }
    
    async saveSnapshot(_id: string, snapshot: Uint8Array): Promise<void> {
        // Persist by applying snapshot to doc; y-indexeddb will store it.
        Y.applyUpdate(this.#doc, snapshot);
    }
    
    close() {
        this.#idb = undefined as any;
    }
}

export class LocalFirstStore implements YjsStore {
    constructor(
        private cache: YjsStore,   // e.g., IndexedDBStore
        private remote: YjsStore   // e.g., SupabaseStore
    ) {}
    
    async load(id: string) {
        // fast path: local snapshot
        const local = await this.cache.load(id);
        // then reconcile with remote tail
        const remote = await this.remote.load(id);
        if (!local) return remote;
        if (!remote) return local;
        
        // Merge both into one state (Yjs is great at this)
        const y = new Y.Doc();
        Y.applyUpdate(y, local);
        Y.applyUpdate(y, remote);
        return Y.encodeStateAsUpdate(y);
    }
    
    async saveUpdate(id: string, u: Uint8Array, meta?: Meta) {
        // write-through
        await this.cache.saveUpdate(id, u, meta);
        // fire-and-forget to remote (or batch)
        this.remote.saveUpdate(id, u, meta).catch(console.error);
    }
    
    watch?(id: string, onUpdate: (u: Uint8Array, m?: any) => void) {
        const offRemote = this.remote.watch?.(id, (u, m) => {
            // persist remote updates locally too
            this.cache.saveUpdate(id, u, m).catch(console.error);
            onUpdate(u, m);
        });
        const offCache = this.cache.watch?.(id, onUpdate); // for cross-tab
        return () => { offRemote?.(); offCache?.(); };
    }
    
    getSnapshot?(id: string) { return this.cache.getSnapshot?.(id) ?? this.remote.getSnapshot?.(id) ?? null as any; }
    async saveSnapshot(id: string, snap: Uint8Array, meta?: { ts?: number; seq?: number }) {
        await this.cache.saveSnapshot?.(id, snap, meta);
        this.remote.saveSnapshot?.(id, snap, meta).catch(console.error);
    }
    
    close?() { this.cache.close?.(); this.remote.close?.(); }
}
