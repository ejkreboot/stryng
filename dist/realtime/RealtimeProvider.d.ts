import * as Y from 'yjs';
export type ProviderStatus = 'connecting' | 'connected' | 'disconnected';
export type StatusEvent = {
    status: ProviderStatus;
};
export type ProviderOptions = {
    serverUrl?: string;
    room?: string;
    token?: string | null;
};
export interface RealtimeProviderRegistry {
    none: true;
    websocket: true;
    supabase: true;
}
export type RealtimeProvider = keyof RealtimeProviderRegistry;
export interface PersistenceProviderRegistry {
    none: false;
    supabase: true;
}
export type PersistenceProviderType = keyof PersistenceProviderRegistry;
export declare abstract class Realtime {
    readonly doc: Y.Doc;
    protected readonly opts: Readonly<Partial<ProviderOptions>>;
    protected readonly statusCbs: Set<(e: StatusEvent) => void>;
    private onDocUpdate?;
    constructor(doc: Y.Doc, opts?: Readonly<Partial<ProviderOptions>>);
    /** Providers must put local updates on the wire. */
    protected abstract sendUpdate(update: Uint8Array): void;
    /** Providers call this when they receive a remote update. */
    protected applyRemote(update: Uint8Array): void;
    /** Optional: providers that need a one-shot handshake can override. */
    syncOnce?(): void;
    /** Optional lifecycle if you don’t want network side effects in the constructor. */
    connect?(): void;
    disconnect?(): void;
    onStatus(cb: (e: StatusEvent) => void): void;
    protected emitStatus(status: ProviderStatus): void;
    /** Free any resources/sockets. */
    destroy(): void;
}
