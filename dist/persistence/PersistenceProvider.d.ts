import * as Y from 'yjs';
export type PersistenceStatus = 'idle' | 'loading' | 'saving' | 'error';
export type PersistenceEvent = {
    status: PersistenceStatus;
    error?: Error;
};
export type PersistenceOptions = {
    /** Document/room identifier for database storage */
    docId?: string;
    /** How often to save in milliseconds (default: 5000) */
    saveInterval?: number;
    /** Whether to auto-save on changes (default: true) */
    autoSave?: boolean;
    /** Whether to auto-load on initialization (default: true) */
    autoLoad?: boolean;
};
export type DocumentMetadata = {
    docId: string;
    lastModified: Date;
    version: number;
    checksum?: string;
};
export type StoredDocument = {
    metadata: DocumentMetadata;
    /** Base64 encoded Y.Doc state */
    state: string;
    /** Optional: individual text items for multi-document scenarios */
    items?: Record<string, string>;
};
export type ConflictResolutionResult = {
    /** Whether the conflict was resolved automatically */
    resolved: boolean;
    /** The merged document state, if resolved */
    mergedState?: Uint8Array;
    /** Error details if resolution failed */
    error?: string;
};
/**
 * Abstract base class for database persistence providers.
 * Handles storing and loading Y.Doc state with conflict resolution.
 */
export declare abstract class PersistenceProvider {
    readonly doc: Y.Doc;
    protected readonly opts: Readonly<PersistenceOptions>;
    protected readonly statusCbs: Set<(e: PersistenceEvent) => void>;
    protected saveTimer?: NodeJS.Timeout;
    protected currentStatus: PersistenceStatus;
    constructor(doc: Y.Doc, opts?: Readonly<PersistenceOptions>);
    /**
     * Load document state from database.
     * Returns null if document doesn't exist.
     */
    abstract load(docId: string): Promise<StoredDocument | null>;
    /**
     * Save document state to database.
     * Should handle optimistic locking/versioning to detect conflicts.
     */
    abstract save(docId: string, document: StoredDocument): Promise<void>;
    /**
     * Get document metadata without loading full state.
     * Useful for checking if document exists and version info.
     */
    abstract getMetadata(docId: string): Promise<DocumentMetadata | null>;
    /**
     * Resolve conflicts when database version differs from local version.
     * Default implementation uses Y.js merging.
     */
    protected resolveConflict(localState: Uint8Array, remoteState: Uint8Array): Promise<ConflictResolutionResult>;
    /**
     * Initialize persistence - load existing document if autoLoad is enabled
     */
    initialize(docId?: string): Promise<void>;
    /**
     * Manually load document from database
     */
    loadDocument(docId: string): Promise<boolean>;
    /**
     * Manually save document to database
     */
    saveDocument(docId?: string, force?: boolean): Promise<void>;
    /**
     * Handle document updates for auto-saving
     */
    private handleDocUpdate;
    /**
     * Extract individual text items for multi-document scenarios
     * Future enhancement: could extract all Y.Text instances from the doc
     */
    private extractTextItems;
    /** Encode Y.Doc state to base64 for storage */
    private encodeState;
    /** Decode base64 state back to Uint8Array */
    private decodeState;
    /** Calculate checksum for conflict detection */
    private calculateChecksum;
    /** Register status change callback */
    onStatus(cb: (e: PersistenceEvent) => void): void;
    /** Remove status callback */
    offStatus(cb: (e: PersistenceEvent) => void): void;
    /** Emit status change events */
    protected emitStatus(status: PersistenceStatus, error?: Error): void;
    /** Get current persistence status */
    getStatus(): PersistenceStatus;
    /** Clean up resources */
    destroy(): void;
}
