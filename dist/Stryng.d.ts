import * as Y from 'yjs';
import { RealtimeProvider } from './realtime';
import { PersistenceEvent } from './persistence';
type DeltaOp = {
    retain?: number;
    insert?: string;
    delete?: number;
    attributes?: Record<string, any>;
};
export type ChangeEvent = {
    source: 'local' | 'remote';
    delta?: DeltaOp[];
    value: string;
};
export type PersistenceChangeEvent = PersistenceEvent;
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
export declare class Stryng {
    #private;
    private doc;
    private text;
    private provider;
    private persistence?;
    private _resolveOnConnect;
    readonly key: string;
    ready: Promise<void>;
    onChange: (change: ChangeEvent) => void;
    onPersistence: (event: PersistenceChangeEvent) => void;
    constructor({ value, doc, onChange, onPersistence, log, provider, persistence, docId, persistenceOptions, room, serverUrl, token }?: StryngOptions);
    static create(value?: string, onChange?: (c: ChangeEvent) => void, opts?: Partial<StryngOptions>): Stryng;
    /**
     * Create a Stryng instance with persistence enabled
     */
    static createWithPersistence(docId: string, value?: string, onChange?: (c: ChangeEvent) => void, onPersistence?: (e: PersistenceChangeEvent) => void, opts?: Partial<StryngOptions>): Promise<Stryng>;
    get(): string;
    update(newValue: string): Promise<void>;
    destroy(): void;
    /**
     * Manually save document to database (if persistence is enabled)
     */
    save(): Promise<void>;
    /**
     * Manually load document from database (if persistence is enabled)
     */
    load(): Promise<boolean>;
    /**
     * Get persistence status
     */
    getPersistenceStatus(): import("./persistence").PersistenceStatus;
    private initializePersistence;
    private onRealtimeConnected;
    private _emit;
}
export {};
