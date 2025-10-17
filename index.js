// stryng.ts
import * as Y from 'yjs';
import diff from 'fast-diff';
export class Stryng {
    #doc;
    #text;
    #provider;
    #ownDoc;
    #debounceMs;
    constructor(opts = {}) {
        const { ydoc, key = 'stryng', initial = '', provider, transport = 'webrtc', room = key, indexeddb = true, connect = true, debounceMs = 20 } = opts;
        this.#doc = ydoc ?? new Y.Doc();
        this.#ownDoc = !ydoc;
        this.#text = this.#doc.getText(key);
        this.#debounceMs = debounceMs;
        this.#provider = provider ?? null;
        // seed only if empty
        if (this.#text.length === 0 && initial) {
            this.#doc.transact(() => this.#text.insert(0, initial));
        }
        // attach default provider only if we own the doc
        if (this.#ownDoc && !provider && connect && typeof window !== 'undefined') {
            this.#attachDefaultProvider(transport, room, indexeddb);
        }
    }
    async #attachDefaultProvider(kind, room, indexeddb) {
        if (indexeddb && typeof window !== 'undefined') {
            import('y-indexeddb').then(({ IndexeddbPersistence }) => new IndexeddbPersistence(room, this.#doc)).catch(() => { });
        }
        if (kind === 'webrtc') {
            const { WebrtcProvider } = await import('y-webrtc');
            this.#provider = new WebrtcProvider(room, this.#doc, {
                signaling: [
                    'wss://signaling.yjs.dev',
                    'wss://y-webrtc-signaling-eu.herokuapp.com',
                    'wss://y-webrtc-signaling-us.herokuapp.com'
                ]
            });
        }
        else {
            const { WebsocketProvider } = await import('y-websocket');
            this.#provider = new WebsocketProvider('wss://demos.yjs.dev', room, this.#doc);
        }
    }
    get() { return this.#text.toString(); }
    async update(next, debounceMs = this.#debounceMs) {
        if (debounceMs > 0) {
            clearTimeout(this._t);
            await new Promise(resolve => {
                this._t = setTimeout(() => {
                    this.#applyDiff(next);
                    resolve();
                }, debounceMs);
            });
        }
        else {
            this.#applyDiff(next);
        }
    }
    #applyDiff(next) {
        const prev = this.#text.toString();
        if (next === prev)
            return;
        const ops = diff(prev, next);
        let cursor = 0;
        this.#doc.transact(() => {
            for (const [t, s] of ops) {
                if (t === diff.EQUAL) {
                    cursor += s.length;
                    continue;
                }
                if (t === diff.DELETE) {
                    this.#text.delete(cursor, s.length);
                    continue;
                }
                if (t === diff.INSERT) {
                    this.#text.insert(cursor, s);
                    cursor += s.length;
                }
            }
        });
    }
    onChange(fn) {
        const obs = () => fn(this.#text.toString());
        this.#text.observe(obs);
        fn(this.get());
        return () => this.#text.unobserve(obs);
    }
    destroy() {
        try {
            this.#provider?.destroy?.();
        }
        catch { }
        if (this.#ownDoc)
            this.#doc.destroy();
    }
    // expose for advanced usage
    get ydoc() { return this.#doc; }
    get ytext() { return this.#text; }
    // --- The magic: static factory for the callable handle ---
    static create(opts = {}) {
        const core = new Stryng(opts);
        const f = (async (next) => {
            if (arguments.length)
                await core.update(String(next));
            return core.get();
        });
        Object.defineProperty(f, 'subscribe', { value: (fn) => core.onChange(fn) });
        Object.defineProperty(f, 'destroy', { value: () => core.destroy() });
        Object.defineProperty(f, 'toString', { value: () => core.get() });
        Object.defineProperty(f, Symbol.toPrimitive, { value: () => core.get() });
        return Object.freeze(f);
    }
}
