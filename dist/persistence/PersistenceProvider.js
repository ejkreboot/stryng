import * as Y from 'yjs';
/**
 * Abstract base class for database persistence providers.
 * Handles storing and loading Y.Doc state with conflict resolution.
 */
export class PersistenceProvider {
    constructor(doc, opts = {}) {
        this.doc = doc;
        this.opts = opts;
        this.statusCbs = new Set();
        this.currentStatus = 'idle';
        // Auto-save setup
        if (this.opts.autoSave !== false) {
            this.doc.on('update', this.handleDocUpdate.bind(this));
        }
    }
    /**
     * Resolve conflicts when database version differs from local version.
     * Default implementation uses Y.js merging.
     */
    async resolveConflict(localState, remoteState) {
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
        }
        catch (error) {
            return {
                resolved: false,
                error: error instanceof Error ? error.message : 'Unknown merge error'
            };
        }
    }
    /**
     * Initialize persistence - load existing document if autoLoad is enabled
     */
    async initialize(docId) {
        if (!docId)
            docId = this.opts.docId;
        if (!docId)
            throw new Error('Document ID is required for persistence');
        if (this.opts.autoLoad !== false) {
            await this.loadDocument(docId);
        }
    }
    /**
     * Manually load document from database
     */
    async loadDocument(docId) {
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
        }
        catch (error) {
            this.emitStatus('error', error instanceof Error ? error : new Error('Load failed'));
            throw error;
        }
    }
    /**
     * Manually save document to database
     */
    async saveDocument(docId, force = false) {
        if (!docId)
            docId = this.opts.docId;
        if (!docId)
            throw new Error('Document ID is required for persistence');
        // Skip if already saving (unless forced)
        if (this.currentStatus === 'saving' && !force)
            return;
        this.emitStatus('saving');
        try {
            const state = Y.encodeStateAsUpdate(this.doc);
            const document = {
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
                    const conflict = await this.resolveConflict(state, this.decodeState(remoteDoc.state));
                    if (conflict.resolved && conflict.mergedState) {
                        // Apply merged state to local doc
                        this.doc.transact(() => {
                            const currentState = Y.encodeStateAsUpdate(this.doc);
                            const diff = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.doc));
                            Y.applyUpdate(this.doc, conflict.mergedState);
                        });
                        // Update document with merged state
                        document.state = this.encodeState(conflict.mergedState);
                        document.metadata.version = Date.now();
                    }
                }
            }
            await this.save(docId, document);
            this.emitStatus('idle');
        }
        catch (error) {
            this.emitStatus('error', error instanceof Error ? error : new Error('Save failed'));
            throw error;
        }
    }
    /**
     * Handle document updates for auto-saving
     */
    handleDocUpdate() {
        if (this.opts.autoSave === false)
            return;
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
    extractTextItems() {
        const items = {};
        // For now, extract known text items
        // Future: iterate through all Y.Text instances in the doc
        const mainText = this.doc.getText('stryng');
        if (mainText.length > 0) {
            items['stryng'] = mainText.toString();
        }
        return items;
    }
    /** Encode Y.Doc state to base64 for storage */
    encodeState(state) {
        if (typeof window !== 'undefined' && 'btoa' in window) {
            let s = '';
            for (let i = 0; i < state.length; i++)
                s += String.fromCharCode(state[i]);
            return btoa(s);
        }
        return Buffer.from(state).toString('base64');
    }
    /** Decode base64 state back to Uint8Array */
    decodeState(encoded) {
        if (typeof window !== 'undefined' && 'atob' in window) {
            const bin = atob(encoded);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++)
                out[i] = bin.charCodeAt(i);
            return out;
        }
        return new Uint8Array(Buffer.from(encoded, 'base64'));
    }
    /** Calculate checksum for conflict detection */
    calculateChecksum(state) {
        // Simple checksum - could use a proper hash function
        let hash = 0;
        for (let i = 0; i < state.length; i++) {
            hash = ((hash << 5) - hash + state[i]) & 0xffffffff;
        }
        return hash.toString(16);
    }
    /** Register status change callback */
    onStatus(cb) {
        this.statusCbs.add(cb);
    }
    /** Remove status callback */
    offStatus(cb) {
        this.statusCbs.delete(cb);
    }
    /** Emit status change events */
    emitStatus(status, error) {
        this.currentStatus = status;
        const event = { status, error };
        for (const cb of this.statusCbs) {
            cb(event);
        }
    }
    /** Get current persistence status */
    getStatus() {
        return this.currentStatus;
    }
    /** Clean up resources */
    destroy() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        this.statusCbs.clear();
        this.doc.off('update', this.handleDocUpdate);
    }
}
