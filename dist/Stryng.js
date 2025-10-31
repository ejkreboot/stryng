var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Stryng_instances, _Stryng_coalesceDelta, _Stryng_fastDiffToDelta;
import * as Y from 'yjs';
import diff from 'fast-diff';
import { WebsocketRealtime, SupabaseRealtime } from './realtime';
import { SupabasePersistence } from './persistence';
const { EQUAL, DELETE, INSERT } = diff;
const noop = () => { };
export class Stryng {
    constructor({ value = '', doc = new Y.Doc(), onChange = noop, onPersistence = noop, log = false, provider, persistence, docId, persistenceOptions, room, serverUrl, token } = {}) {
        _Stryng_instances.add(this);
        this.doc = doc;
        this.text = this.doc.getText('stryng');
        this.key = `stryng-${Math.random().toString(36).slice(2, 9)}`;
        this.onChange = onChange;
        this.onPersistence = onPersistence;
        // Choose a realtime provider:
        if (provider == "websocket") {
            this.provider = new WebsocketRealtime(this.doc, { serverUrl, room, token });
        }
        else if (provider == "supabase") {
            this.provider = new SupabaseRealtime(this.doc, { serverUrl, room, token });
        }
        // Initialize persistence if requested
        if (persistence) {
            this.initializePersistence(persistence, docId || room, persistenceOptions, {
                serverUrl,
                token: token || undefined
            });
        }
        this.ready = new Promise((r) => (this._resolveOnConnect = r));
        // Handle realtime connection status
        this.provider?.onStatus((e) => {
            if (log)
                console.log(`[stryng] realtime ${e.status}`);
            if (e.status === 'connected') {
                this.onRealtimeConnected(value);
            }
        });
        this.text.observe((event, txn) => {
            if (log)
                console.log('[stryng] delta:', event.delta);
            this._emit(txn.local ? 'local' : 'remote', event.delta);
        });
    }
    static create(value = '', onChange = noop, opts = {}) {
        const instance = new Stryng({ value, onChange, ...opts });
        return instance;
    }
    /**
     * Create a Stryng instance with persistence enabled
     */
    static async createWithPersistence(docId, value = '', onChange = noop, onPersistence = noop, opts = {}) {
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
    get() {
        return this.text.toString();
    }
    async update(newValue) {
        if (newValue === this.get())
            return;
        this.doc.transact(() => {
            const delta = __classPrivateFieldGet(this, _Stryng_instances, "m", _Stryng_fastDiffToDelta).call(this, this.get(), newValue);
            if (delta !== 'replace') {
                this.text.applyDelta(delta);
                return;
            }
            this.text.delete(0, this.text.length);
            this.text.insert(0, newValue);
        }, 'local');
    }
    destroy() {
        this.provider?.destroy();
        this.persistence?.destroy();
        this.doc.destroy();
    }
    /**
     * Manually save document to database (if persistence is enabled)
     */
    async save() {
        if (!this.persistence) {
            throw new Error('Persistence is not enabled');
        }
        await this.persistence.saveDocument();
    }
    /**
     * Manually load document from database (if persistence is enabled)
     */
    async load() {
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
    async initializePersistence(persistence, docId, persistenceOptions, providerOpts) {
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
            }
            catch (error) {
                console.error('Failed to initialize persistence:', error);
                // Don't throw - let the app continue without persistence
            }
        }
    }
    async onRealtimeConnected(initialValue) {
        // If we have persistence, load from database first
        if (this.persistence) {
            try {
                const loaded = await this.load();
                if (loaded) {
                    // Document was loaded from database, resolve ready promise
                    this._resolveOnConnect();
                    return;
                }
            }
            catch (error) {
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
    _emit(source, delta) {
        this.onChange?.({ source, delta, value: this.get() });
    }
}
_Stryng_instances = new WeakSet(), _Stryng_coalesceDelta = function _Stryng_coalesceDelta(delta) {
    if (!delta.length)
        return delta;
    const out = [];
    for (const op of delta) {
        const last = out[out.length - 1];
        if (op.retain && last?.retain)
            last.retain += op.retain;
        else if (op.delete && last?.delete)
            last.delete += op.delete;
        else if (op.insert && last?.insert)
            last.insert += op.insert;
        else
            out.push(op);
    }
    return out;
}, _Stryng_fastDiffToDelta = function _Stryng_fastDiffToDelta(prev, next) {
    if (prev === next)
        return [];
    const ops = diff(prev, next);
    const edited = ops.reduce((n, [t, s]) => n + (t === EQUAL ? 0 : s.length), 0);
    const denom = Math.max(prev.length, next.length, 1);
    if (edited / denom > 0.6)
        return 'replace';
    const delta = [];
    for (const [t, s] of ops) {
        if (t === EQUAL)
            delta.push({ retain: s.length });
        else if (t === DELETE)
            delta.push({ delete: s.length });
        else if (t === INSERT)
            delta.push({ insert: s });
    }
    return __classPrivateFieldGet(this, _Stryng_instances, "m", _Stryng_coalesceDelta).call(this, delta);
};
