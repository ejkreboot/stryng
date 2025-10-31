// SupabaseRealtime.ts
import * as Y from 'yjs';
import { createClient } from '@supabase/supabase-js';
import { Realtime } from './RealtimeProvider';
const DEFAULTS = {
    serverUrl: typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_SUPABASE_URL ?? ''
        : '',
    room: 'stryng-room',
    token: typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
        : ''
};
export class SupabaseRealtime extends Realtime {
    constructor(doc, opts = {}) {
        super(doc, opts);
        this.channel = null;
        this.connected = false;
        this.syncRetryTimer = null;
        this.syncAttempts = 0;
        const { serverUrl = DEFAULTS.serverUrl, room = DEFAULTS.room, token = DEFAULTS.token, } = opts;
        if (!serverUrl)
            throw new Error('SupabaseRealtime: serverUrl is required');
        if (!token)
            throw new Error('SupabaseRealtime: token (anon key or user JWT) is required');
        this.client = createClient(serverUrl, token);
        this.connect();
    }
    sendUpdate(update) {
        if (!this.channel)
            return;
        void this.channel.send({
            type: 'broadcast',
            event: 'y-update',
            payload: { u: encodeB64(update) },
        });
    }
    onStatus(cb) {
        this.statusCbs.add(cb);
    }
    connect() {
        if (this.channel)
            return;
        const room = this.opts.room ?? 'stryng-room';
        this.emitStatus('connecting');
        this.channel = this.client.channel(`yjs:${room}`, { config: { broadcast: { self: false } } });
        this.subscribeToChannelEvents();
        // Status bridging
        this.channel.subscribe((status) => {
            switch (status) {
                case 'SUBSCRIBED':
                    this.connected = true;
                    this.emitStatus('connected');
                    this.syncOnce?.();
                    break;
                case 'CLOSED':
                case 'CHANNEL_ERROR':
                case 'TIMED_OUT':
                    this.connected = false;
                    this.emitStatus('disconnected');
                    if (this.syncRetryTimer) {
                        clearTimeout(this.syncRetryTimer);
                        this.syncRetryTimer = null;
                    }
                    this.syncAttempts = 0;
                    break;
            }
        });
    }
    syncOnce() {
        try {
            const sv = Y.encodeStateVector(this.doc);
            void this.channel?.send({
                type: 'broadcast',
                event: 'y-sync-ask',
                payload: { sv: encodeB64(sv) },
            });
            // Retry if nobody answers (simple backoff up to ~5s)
            const delay = Math.min(5000, 500 + this.syncAttempts * 750);
            this.syncRetryTimer = setTimeout(() => {
                this.syncAttempts++;
                // stop after a few tries; you can adjust this policy
                if (this.syncAttempts < 6 && this.connected)
                    this.syncOnce();
            }, delay);
        }
        catch { /* swallow */ }
    }
    disconnect() {
        if (this.channel) {
            this.client.removeChannel(this.channel);
            this.channel = null;
            this.emitStatus('disconnected');
        }
    }
    // --- helpers ---
    emitStatus(status) {
        const evt = { status };
        for (const cb of this.statusCbs)
            cb(evt);
    }
    subscribeToChannelEvents() {
        this.channel?.on('broadcast', { event: 'y-update' }, (msg) => {
            try {
                const uB64 = msg?.payload?.u;
                if (!uB64)
                    return;
                this.applyRemote(decodeB64(uB64)); // from base class
            }
            catch { /* swallow */ }
        });
        this.channel?.on('broadcast', { event: 'y-sync-ask' }, (msg) => {
            try {
                const svB64 = msg?.payload?.sv;
                // If their state-vector was omitted/invalid, just send full state
                const sv = svB64 ? decodeB64(svB64) : undefined;
                const update = sv ? Y.encodeStateAsUpdate(this.doc, sv) : Y.encodeStateAsUpdate(this.doc);
                void this.channel.send({
                    type: 'broadcast',
                    event: 'y-sync',
                    payload: { u: encodeB64(update) },
                });
            }
            catch { /* swallow */ }
        });
        this.channel?.on('broadcast', { event: 'y-sync' }, (msg) => {
            try {
                const uB64 = msg?.payload?.u;
                if (!uB64)
                    return;
                this.applyRemote(decodeB64(uB64)); // from base class
                // got at least one response; stop retrying
                if (this.syncRetryTimer) {
                    clearTimeout(this.syncRetryTimer);
                    this.syncRetryTimer = null;
                }
                this.syncAttempts = 0;
            }
            catch { /* swallow */ }
        });
    }
}
function encodeB64(u8) {
    if (typeof window !== 'undefined' && 'btoa' in window) {
        let s = '';
        for (let i = 0; i < u8.length; i++)
            s += String.fromCharCode(u8[i]);
        // @ts-ignore
        return btoa(s);
    }
    // Node
    return Buffer.from(u8).toString('base64');
}
function decodeB64(b64) {
    if (typeof window !== 'undefined' && 'atob' in window) {
        // @ts-ignore
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++)
            out[i] = bin.charCodeAt(i);
        return out;
    }
    // Node
    return new Uint8Array(Buffer.from(b64, 'base64'));
}
