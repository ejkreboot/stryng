import { PersistenceProvider, PersistenceOptions, StoredDocument, DocumentMetadata } from './PersistenceProvider';
import * as Y from 'yjs';
type SupabasePersistenceOptions = PersistenceOptions & {
    serverUrl?: string;
    token?: string;
    tableName?: string;
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
export declare class SupabasePersistence extends PersistenceProvider {
    private client;
    private tableName;
    constructor(doc: Y.Doc, opts?: SupabasePersistenceOptions);
    /**
     * Load document from Supabase
     */
    load(docId: string): Promise<StoredDocument | null>;
    /**
     * Save document to Supabase with conflict detection
     */
    save(docId: string, document: StoredDocument): Promise<void>;
    /**
     * Get document metadata without loading full state
     */
    getMetadata(docId: string): Promise<DocumentMetadata | null>;
    /**
     * List all documents (useful for document management)
     */
    listDocuments(limit?: number, offset?: number): Promise<DocumentMetadata[]>;
    /**
     * Delete a document
     */
    deleteDocument(docId: string): Promise<void>;
    /**
     * Check if the required table exists and create it if needed
     * (Requires appropriate database permissions)
     */
    ensureSchema(): Promise<void>;
    /**
     * Get table statistics (useful for monitoring)
     */
    getStats(): Promise<{
        total: number;
        lastModified?: Date;
    }>;
}
export {};
