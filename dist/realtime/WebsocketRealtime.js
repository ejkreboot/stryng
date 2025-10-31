import { WebsocketProvider as YWebsocketProvider } from 'y-websocket';
import { Realtime } from './RealtimeProvider';
const DEFAULTS = {
    serverUrl: 'wss://ws.codyx.io/ws-codyx/',
    room: 'stryng-room',
    token: 'rjKfn9aBIjhTgrVV',
};
export class WebsocketRealtime extends Realtime {
    constructor(doc, opts = {}) {
        super(doc, opts);
        const { serverUrl = DEFAULTS.serverUrl, room = DEFAULTS.room, token = DEFAULTS.token, } = opts;
        this.inner = new YWebsocketProvider(serverUrl, room, doc, {
            params: token ? { token } : undefined,
        });
        // Bridge provider status -> base status
        this.inner.on('status', (e) => {
            const s = e?.status;
            if (s === 'connected' || s === 'disconnected')
                this.emitStatus(s);
        });
    }
    /** y-websocket already sends local updates; we intentionally do nothing. */
    sendUpdate(_update) {
        // no-op
    }
    /** Optional lifecycle: pass-throughs */
    connect() {
        // y-websocket doesn't emit "connecting", so we can emit it here for consistency
        this.emitStatus('connecting');
        this.inner.connect?.();
    }
    disconnect() {
        this.inner.disconnect?.();
        this.emitStatus('disconnected');
    }
    destroy() {
        this.inner.destroy();
        super.destroy();
    }
}
