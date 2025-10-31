-- Stryng Database Schema for Supabase/PostgreSQL
-- This schema supports both single documents and multi-document scenarios

-- Main documents table for storing Y.Doc states
CREATE TABLE stryng_documents (
  doc_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,                    -- Base64 encoded Y.Doc state
  items JSONB DEFAULT '{}',              -- Individual text items for multi-doc support
  version BIGINT NOT NULL,               -- Version for optimistic locking
  checksum TEXT,                         -- Integrity verification
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for version-based conflict detection
CREATE INDEX idx_stryng_documents_version ON stryng_documents(doc_id, version);

-- Index for timestamp-based queries
CREATE INDEX idx_stryng_documents_modified ON stryng_documents(last_modified DESC);

-- Optional: Row Level Security (RLS) for multi-tenant scenarios
-- Uncomment if you need per-user document access control
-- ALTER TABLE stryng_documents ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for user-specific documents
-- CREATE POLICY "Users can access own documents" ON stryng_documents
--   FOR ALL USING (auth.uid()::text = split_part(doc_id, ':', 1));

-- Optional: Function to automatically update last_modified timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update last_modified
CREATE TRIGGER update_stryng_documents_modtime
  BEFORE UPDATE ON stryng_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

-- Optional: Future extension for document metadata and permissions
CREATE TABLE stryng_document_metadata (
  doc_id TEXT PRIMARY KEY REFERENCES stryng_documents(doc_id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  tags JSONB DEFAULT '[]',
  owner_id UUID REFERENCES auth.users(id),
  permissions JSONB DEFAULT '{"read": [], "write": [], "admin": []}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Audit log for document changes
CREATE TABLE stryng_document_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id TEXT NOT NULL REFERENCES stryng_documents(doc_id) ON DELETE CASCADE,
  state_diff TEXT,                       -- Y.js update diff for space efficiency
  version_from BIGINT,
  version_to BIGINT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  change_summary TEXT
);

-- Index for history queries
CREATE INDEX idx_stryng_history_doc_time ON stryng_document_history(doc_id, timestamp DESC);

-- View for document statistics
CREATE VIEW stryng_document_stats AS
SELECT 
  d.doc_id,
  d.version,
  d.last_modified,
  d.created_at,
  jsonb_object_keys(d.items) as text_items,
  length(d.state) as state_size_bytes,
  COUNT(h.id) as history_count
FROM stryng_documents d
LEFT JOIN stryng_document_history h ON d.doc_id = h.doc_id
GROUP BY d.doc_id, d.version, d.last_modified, d.created_at, d.items, d.state;

-- Example queries for monitoring and maintenance:

-- Find most active documents
-- SELECT doc_id, history_count, last_modified 
-- FROM stryng_document_stats 
-- ORDER BY history_count DESC, last_modified DESC 
-- LIMIT 10;

-- Find documents that haven't been modified recently
-- SELECT doc_id, last_modified
-- FROM stryng_documents 
-- WHERE last_modified < NOW() - INTERVAL '30 days'
-- ORDER BY last_modified ASC;

-- Clean up old history (keep last 100 entries per document)
-- WITH ranked_history AS (
--   SELECT id, ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY timestamp DESC) as rn
--   FROM stryng_document_history
-- )
-- DELETE FROM stryng_document_history 
-- WHERE id IN (SELECT id FROM ranked_history WHERE rn > 100);