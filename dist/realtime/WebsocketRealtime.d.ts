import * as Y from 'yjs';
import { Realtime, ProviderOptions } from './RealtimeProvider';
type WebsocketOpts = Pick<ProviderOptions, 'serverUrl' | 'room' | 'token'>;
export declare class WebsocketRealtime extends Realtime {
    private inner;
    constructor(doc: Y.Doc, opts?: Partial<WebsocketOpts>);
    /** y-websocket already sends local updates; we intentionally do nothing. */
    protected sendUpdate(_update: Uint8Array): void;
    /** Optional lifecycle: pass-throughs */
    connect(): void;
    disconnect(): void;
    destroy(): void;
}
export {};
