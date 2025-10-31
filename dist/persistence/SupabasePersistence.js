import { createClient } from '@supabase/supabase-js';
import { PersistenceProvider } from './PersistenceProvider';
const DEFAULTS = {
    serverUrl: typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_SUPABASE_URL ?? ''
        : '',
    token: typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
        : '',
    tableName: 'stryng_documents'
};
/**
 * Database schema for Supabase:
 *
 * CREATE TABLE stryng_documents (
 *   doc_id TEXT PRIMARY KEY,
 *   state TEXT NOT NULL,           -- Base64 encoded Y.Doc state
 *   items JSONB DEFAULT '{}',      -- Individual text items for multi-doc support
 *   version BIGINT NOT NULL,       -- Version for optimistic locking
 *   checksum TEXT,                 -- Integrity check
 *   last_modified TIMESTAMPTZ DEFAULT NOW(),
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- Index for version-based conflict detection
 * CREATE INDEX idx_stryng_documents_version ON stryng_documents(doc_id, version);
 */
export class SupabasePersistence extends PersistenceProvider {
    constructor(doc, opts = {}) {
        super(doc, opts);
        const { serverUrl = DEFAULTS.serverUrl, token = DEFAULTS.token, tableName = DEFAULTS.tableName } = opts;
        if (!serverUrl) {
            throw new Error('SupabasePersistence: serverUrl is required');
        }
        if (!token) {
            throw new Error('SupabasePersistence: token (anon key or user JWT) is required');
        }
        this.client = createClient(serverUrl, token);
        this.tableName = tableName;
    }
    /**
     * Load document from Supabase
     */
    async load(docId) {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('*')
                .eq('doc_id', docId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows returned - document doesn't exist
                    return null;
                }
                throw new Error(`Failed to load document: ${error.message}`);
            }
            if (!data)
                return null;
            return {
                metadata: {
                    docId: data.doc_id,
                    lastModified: new Date(data.last_modified),
                    version: data.version,
                    checksum: data.checksum
                },
                state: data.state,
                items: data.items || {}
            };
        }
        catch (error) {
            throw new Error(`Load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Save document to Supabase with conflict detection
     */
    async save(docId, document) {
        try {
            // First, check if document exists and get current version
            const existing = await this.getMetadata(docId);
            const now = new Date().toISOString();
            const payload = {
                doc_id: docId,
                state: document.state,
                items: document.items,
                version: document.metadata.version,
                checksum: document.metadata.checksum,
                last_modified: now
            };
            let query;
            if (existing) {
                // Update existing document with version check for optimistic locking
                query = this.client
                    .from(this.tableName)
                    .update(payload)
                    .eq('doc_id', docId)
                    .eq('version', existing.version); // Optimistic locking
            }
            else {
                // Insert new document
                query = this.client
                    .from(this.tableName)
                    .insert({
                    ...payload,
                    created_at: now
                });
            }
            const { error } = await query;
            if (error) {
                // Check if it's a version conflict
                if (error.code === 'PGRST116' && existing) {
                    throw new Error('Document was modified by another user. Please reload and try again.');
                }
                throw new Error(`Failed to save document: ${error.message}`);
            }
        }
        catch (error) {
            throw new Error(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Get document metadata without loading full state
     */
    async getMetadata(docId) {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('doc_id, version, checksum, last_modified')
                .eq('doc_id', docId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    return null; // Document doesn't exist
                }
                throw new Error(`Failed to get metadata: ${error.message}`);
            }
            if (!data)
                return null;
            return {
                docId: data.doc_id,
                lastModified: new Date(data.last_modified),
                version: data.version,
                checksum: data.checksum
            };
        }
        catch (error) {
            throw new Error(`Metadata lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * List all documents (useful for document management)
     */
    async listDocuments(limit = 100, offset = 0) {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('doc_id, version, checksum, last_modified')
                .order('last_modified', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) {
                throw new Error(`Failed to list documents: ${error.message}`);
            }
            return (data || []).map(row => ({
                docId: row.doc_id,
                lastModified: new Date(row.last_modified),
                version: row.version,
                checksum: row.checksum
            }));
        }
        catch (error) {
            throw new Error(`List failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Delete a document
     */
    async deleteDocument(docId) {
        try {
            const { error } = await this.client
                .from(this.tableName)
                .delete()
                .eq('doc_id', docId);
            if (error) {
                throw new Error(`Failed to delete document: ${error.message}`);
            }
        }
        catch (error) {
            throw new Error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Check if the required table exists and create it if needed
     * (Requires appropriate database permissions)
     */
    async ensureSchema() {
        try {
            // Try to query the table to see if it exists
            const { error } = await this.client
                .from(this.tableName)
                .select('doc_id')
                .limit(1);
            if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
                // Table doesn't exist - this would typically be handled by migrations
                // but we can provide helpful error message
                throw new Error(`
Table '${this.tableName}' does not exist. Please create it with the following SQL:

CREATE TABLE ${this.tableName} (
  doc_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  items JSONB DEFAULT '{}',
  version BIGINT NOT NULL,
  checksum TEXT,
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_${this.tableName}_version ON ${this.tableName}(doc_id, version);
        `);
            }
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('CREATE TABLE')) {
                throw error; // Re-throw our helpful schema error
            }
            throw new Error(`Schema check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Get table statistics (useful for monitoring)
     */
    async getStats() {
        try {
            const { data, error, count } = await this.client
                .from(this.tableName)
                .select('last_modified', { count: 'exact' })
                .order('last_modified', { ascending: false })
                .limit(1);
            if (error) {
                throw new Error(`Failed to get stats: ${error.message}`);
            }
            return {
                total: count || 0,
                lastModified: data && data.length > 0 ? new Date(data[0].last_modified) : undefined
            };
        }
        catch (error) {
            throw new Error(`Stats failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
