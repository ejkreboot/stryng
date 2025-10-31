import * as Y from 'yjs';
import { Realtime, StatusEvent, ProviderOptions, ProviderStatus } from './RealtimeProvider';
type SupabaseOpts = Pick<ProviderOptions, 'serverUrl' | 'room' | 'token'>;
export declare class SupabaseRealtime extends Realtime {
    private client;
    private channel;
    private connected;
    private syncRetryTimer;
    private syncAttempts;
    constructor(doc: Y.Doc, opts?: Partial<SupabaseOpts>);
    protected sendUpdate(update: Uint8Array): void;
    onStatus(cb: (e: StatusEvent) => void): void;
    connect(): void;
    syncOnce(): void;
    disconnect(): void;
    emitStatus(status: ProviderStatus): void;
    private subscribeToChannelEvents;
}
export {};
