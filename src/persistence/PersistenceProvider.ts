import * as Y from 'yjs';

export type PersistenceStatus = 'idle' | 'loading' | 'saving' | 'error';
export type PersistenceEvent = { status: PersistenceStatus; error?: Error };

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
export abstract class PersistenceProvider {
  protected readonly statusCbs = new Set<(e: PersistenceEvent) => void>();
  protected saveTimer?: NodeJS.Timeout;
  protected currentStatus: PersistenceStatus = 'idle';
  
  constructor(
    public readonly doc: Y.Doc,
    protected readonly opts: Readonly<PersistenceOptions> = {}
  ) {
    // Auto-save setup
    if (this.opts.autoSave !== false) {
      this.doc.on('update', this.handleDocUpdate.bind(this));
    }
  }

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
  protected async resolveConflict(
    localState: Uint8Array,
    remoteState: Uint8Array
  ): Promise<ConflictResolutionResult> {
    try {
      // Create temporary doc for merging
      const tempDoc = new Y.Doc();
      
      // Apply both states - Y.js will handle the CRDT merging
      Y.applyUpdate(tempDoc, localState);
      Y.applyUpdate(tempDoc, remoteState);
      
      return {
        resolved: true,
        mergedState: Y.encodeStateAsUpdate(tempDoc)
      };
    } catch (error) {
      return {
        resolved: false,
        error: error instanceof Error ? error.message : 'Unknown merge error'
      };
    }
  }

  /**
   * Initialize persistence - load existing document if autoLoad is enabled
   */
  async initialize(docId?: string): Promise<void> {
    if (!docId) docId = this.opts.docId;
    if (!docId) throw new Error('Document ID is required for persistence');

    if (this.opts.autoLoad !== false) {
      await this.loadDocument(docId);
    }
  }

  /**
   * Manually load document from database
   */
  async loadDocument(docId: string): Promise<boolean> {
    this.emitStatus('loading');
    
    try {
      const stored = await this.load(docId);
      if (!stored) {
        this.emitStatus('idle');
        return false;
      }

      // Decode and apply state
      const state = this.decodeState(stored.state);
      Y.applyUpdate(this.doc, state);
      
      this.emitStatus('idle');
      return true;
    } catch (error) {
      this.emitStatus('error', error instanceof Error ? error : new Error('Load failed'));
      throw error;
    }
  }

  /**
   * Manually save document to database
   */
  async saveDocument(docId?: string, force = false): Promise<void> {
    if (!docId) docId = this.opts.docId;
    if (!docId) throw new Error('Document ID is required for persistence');

    // Skip if already saving (unless forced)
    if (this.currentStatus === 'saving' && !force) return;

    this.emitStatus('saving');

    try {
      const state = Y.encodeStateAsUpdate(this.doc);
      const document: StoredDocument = {
        metadata: {
          docId,
          lastModified: new Date(),
          version: Date.now(), // Simple versioning, could be more sophisticated
          checksum: this.calculateChecksum(state)
        },
        state: this.encodeState(state),
        // Future: add individual items for multi-document support
        items: this.extractTextItems()
      };

      // Check for conflicts
      const existing = await this.getMetadata(docId);
      if (existing && existing.version > document.metadata.version - 10000) {
        // Potential conflict - load and merge
        const remoteDoc = await this.load(docId);
        if (remoteDoc) {
          const conflict = await this.resolveConflict(
            state,
            this.decodeState(remoteDoc.state)
          );
          
          if (conflict.resolved && conflict.mergedState) {
            // Apply merged state to local doc
            this.doc.transact(() => {
              const currentState = Y.encodeStateAsUpdate(this.doc);
              const diff = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.doc));
              Y.applyUpdate(this.doc, conflict.mergedState!);
            });
            
            // Update document with merged state
            document.state = this.encodeState(conflict.mergedState);
            document.metadata.version = Date.now();
          }
        }
      }

      await this.save(docId, document);
      this.emitStatus('idle');
    } catch (error) {
      this.emitStatus('error', error instanceof Error ? error : new Error('Save failed'));
      throw error;
    }
  }

  /**
   * Handle document updates for auto-saving
   */
  private handleDocUpdate(): void {
    if (this.opts.autoSave === false) return;

    // Debounce saves
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    const interval = this.opts.saveInterval ?? 5000;
    this.saveTimer = setTimeout(() => {
      if (this.opts.docId) {
        this.saveDocument(this.opts.docId).catch(console.error);
      }
    }, interval);
  }

  /**
   * Extract individual text items for multi-document scenarios
   * Future enhancement: could extract all Y.Text instances from the doc
   */
  private extractTextItems(): Record<string, string> {
    const items: Record<string, string> = {};
    
    // For now, extract known text items
    // Future: iterate through all Y.Text instances in the doc
    const mainText = this.doc.getText('stryng');
    if (mainText.length > 0) {
      items['stryng'] = mainText.toString();
    }

    return items;
  }

  /** Encode Y.Doc state to base64 for storage */
  private encodeState(state: Uint8Array): string {
    if (typeof window !== 'undefined' && 'btoa' in window) {
      let s = '';
      for (let i = 0; i < state.length; i++) s += String.fromCharCode(state[i]);
      return btoa(s);
    }
    return Buffer.from(state).toString('base64');
  }

  /** Decode base64 state back to Uint8Array */
  private decodeState(encoded: string): Uint8Array {
    if (typeof window !== 'undefined' && 'atob' in window) {
      const bin = atob(encoded);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(encoded, 'base64'));
  }

  /** Calculate checksum for conflict detection */
  private calculateChecksum(state: Uint8Array): string {
    // Simple checksum - could use a proper hash function
    let hash = 0;
    for (let i = 0; i < state.length; i++) {
      hash = ((hash << 5) - hash + state[i]) & 0xffffffff;
    }
    return hash.toString(16);
  }

  /** Register status change callback */
  onStatus(cb: (e: PersistenceEvent) => void): void {
    this.statusCbs.add(cb);
  }

  /** Remove status callback */
  offStatus(cb: (e: PersistenceEvent) => void): void {
    this.statusCbs.delete(cb);
  }

  /** Emit status change events */
  protected emitStatus(status: PersistenceStatus, error?: Error): void {
    this.currentStatus = status;
    const event: PersistenceEvent = { status, error };
    for (const cb of this.statusCbs) {
      cb(event);
    }
  }

  /** Get current persistence status */
  getStatus(): PersistenceStatus {
    return this.currentStatus;
  }

  /** Clean up resources */
  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    this.statusCbs.clear();
    this.doc.off('update', this.handleDocUpdate);
  }
}