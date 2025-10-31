# ✨ Stryng

**Real-time Collaborative Text Editing Library**

A TypeScript library for real-time collaborative text editing built on **Y.js CRDTs** with pluggable realtime providers and database persistence. Perfect for building collaborative editors, notebooks, and multi-user document applications.

## 🌟 Features

- **🔄 Real-time Collaboration**: Multiple users can edit simultaneously with instant synchronization
- **💾 Database Persistence**: Automatic save/load with conflict resolution and optimistic locking
- **🔌 Pluggable Providers**: WebSocket and Supabase Realtime support with extensible architecture
- **🛡️ Conflict-Free**: Built on Y.js CRDTs for automatic conflict resolution
- **⚡ High Performance**: Optimized delta-based updates and efficient diff algorithms
- **🏗️ Multi-Document**: Share Y.Doc instances across multiple text areas for atomic updates
- **📱 Framework Agnostic**: Works with React, Vue, Svelte, or vanilla JavaScript

## 📦 Installation

```bash
npm install stryng
```

### Peer Dependencies

Install the providers you need:

```bash
# For Supabase Realtime + Persistence
npm install @supabase/supabase-js yjs

# For WebSocket Realtime
npm install y-websocket yjs

# For Svelte integration
npm install svelte
```

## 🚀 Quick Start

### Basic Collaborative Editor

```typescript
import { Stryng } from 'stryng';

// Environment variables required for Supabase:
// VITE_SUPABASE_URL=https://your-project.supabase.co
// VITE_SUPABASE_ANON_KEY=your-anon-key

// Create a simple collaborative text editor
const stryng = Stryng.create(
  'Hello, World!',  // Initial content
  (change) => {     // Change handler
    console.log('Text changed:', change.value);
    document.getElementById('editor').value = change.value;
  },
  {
    provider: 'supabase',
    room: 'my-document-id'
  }
);

// Update content programmatically
await stryng.update('New text content');

// Get current content
const currentText = stryng.get();
```

### With Database Persistence

```typescript
import { Stryng } from 'stryng';

// Environment variables required for Supabase:
// VITE_SUPABASE_URL=https://your-project.supabase.co
// VITE_SUPABASE_ANON_KEY=your-anon-key

// Create with both real-time sync and database persistence
const stryng = await Stryng.createWithPersistence(
  'my-document-id',           // Document ID for database
  'Initial content',          // Fallback content if document doesn't exist
  (change) => {               // Real-time change handler
    updateUI(change.value);
  },
  (persistence) => {          // Persistence event handler
    console.log('Save status:', persistence.status);
  },
  {
    provider: 'supabase',
    persistenceOptions: {
      autoSave: true,         // Auto-save every 2 seconds
      saveInterval: 2000
    }
  }
);

// Manual save/load
await stryng.save();
const loaded = await stryng.load();
```

## 🏗️ Multi-Document Architecture

Perfect for notebooks, multi-panel editors, and complex documents:

```typescript
import { Stryng } from 'stryng';
import * as Y from 'yjs';

// Environment variables required for Supabase:
// VITE_SUPABASE_URL=https://your-project.supabase.co
// VITE_SUPABASE_ANON_KEY=your-anon-key

// Shared Y.Doc for atomic updates across multiple text areas
const sharedDoc = new Y.Doc();

// Create multiple collaborative text instances
const notebook = {
  cell1: new Stryng({
    doc: sharedDoc,           // Share the Y.Doc
    value: '# Title Cell',
    onChange: (change) => updateCell1(change.value),
    provider: 'supabase',
    room: 'notebook-123'
  }),
  
  cell2: new Stryng({
    doc: sharedDoc,           // Same shared document
    value: 'print("Hello")',
    onChange: (change) => updateCell2(change.value),
    // Inherits provider/room from shared doc
  }),
  
  cell3: new Stryng({
    doc: sharedDoc,
    value: '## Output',
    onChange: (change) => updateCell3(change.value),
  })
};

// All cells sync together atomically!
// Changes to any cell are synchronized in real-time
```

## 🔌 Providers

### Supabase Realtime + Persistence

```typescript
// Environment variables required:
// VITE_SUPABASE_URL=https://your-project.supabase.co
// VITE_SUPABASE_ANON_KEY=your-anon-key

const stryng = await Stryng.createWithPersistence(
  'document-id',
  'Initial content',
  onChange,
  onPersistence,
  {
    provider: 'supabase',
    room: 'collaborative-room',
    persistence: 'supabase'
  }
);
```

### WebSocket Realtime

```typescript
// ⚠️ WARNING: Default server is a demo server with NO performance 
// guarantees and may disappear without notice. Intended for testing only.
// For production, deploy your own y-websocket server.

const stryng = Stryng.create(
  'Initial content',
  onChange,
  {
    provider: 'websocket',
    // Default demo server (unreliable)
    serverUrl: 'wss://ws.codyx.io/ws-codyx/',
    room: 'my-room'
  }
);

// Production example with your own server:
const prodStryng = Stryng.create(
  'Initial content',
  onChange,
  {
    provider: 'websocket',
    serverUrl: 'wss://your-websocket-server.com/ws',
    room: 'my-room',
    token: 'your-auth-token'  // Optional authentication
  }
);
```

## 📊 Database Schema (Supabase)

Run this SQL in your Supabase dashboard:

```sql
-- Main documents table
CREATE TABLE stryng_documents (
  doc_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,                    -- Base64 encoded Y.Doc state
  items JSONB DEFAULT '{}',              -- Individual text items
  version BIGINT NOT NULL,               -- Optimistic locking
  checksum TEXT,                         -- Integrity verification
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_stryng_documents_version ON stryng_documents(doc_id, version);
CREATE INDEX idx_stryng_documents_modified ON stryng_documents(last_modified DESC);
```

## 🎯 Advanced Usage

### Custom Change Handling

```typescript
const stryng = Stryng.create('', (change) => {
  console.log('Change source:', change.source); // 'local' or 'remote'
  console.log('Delta operations:', change.delta);
  console.log('Full text:', change.value);
  
  if (change.source === 'remote') {
    // Handle remote user changes
    highlightRemoteChanges(change.delta);
  }
});
```

### Performance Monitoring

```typescript
const stryng = Stryng.create('', onChange, {
  provider: 'supabase',
  log: true,  // Enable console logging
  onStatus: (event) => {
    console.log('Connection status:', event.status);
    // 'connecting' | 'connected' | 'disconnected'
  }
});
```

### Error Handling

```typescript
const stryng = await Stryng.createWithPersistence(
  'doc-id',
  'content',
  onChange,
  (persistence) => {
    if (persistence.status === 'error') {
      console.error('Persistence error:', persistence.error);
      showErrorToUser('Failed to save document');
    }
  }
);

try {
  await stryng.save();
} catch (error) {
  if (error.message.includes('modified by another user')) {
    // Document was modified by someone else - auto-merge handles this
    console.log('Conflict detected and resolved automatically');
  }
}
```

## 🎮 Demo Application

Check out the full-featured demo with beautiful UI:

```bash
cd demo/
npm install
npm run dev
```

Open http://localhost:5173 to see:
- Real-time collaborative editing
- Database persistence with status indicators
- Multiple sample documents
- Performance monitoring
- Settings panel and statistics

## 📚 API Reference

### `Stryng.create(value, onChange, options?)`

Create a basic collaborative text instance.

**Parameters:**
- `value: string` - Initial text content
- `onChange: (change: ChangeEvent) => void` - Change event handler
- `options?: StryngOptions` - Configuration options

### `Stryng.createWithPersistence(docId, value, onChange, onPersistence, options?)`

Create with both real-time sync and database persistence.

**Parameters:**
- `docId: string` - Unique document identifier for database
- `value: string` - Initial/fallback content
- `onChange: (change: ChangeEvent) => void` - Real-time change handler
- `onPersistence: (event: PersistenceEvent) => void` - Persistence status handler
- `options?: StryngOptions` - Configuration options

### Instance Methods

```typescript
// Get current text content
const text: string = stryng.get();

// Update text content
await stryng.update(newText: string);

// Manual database operations (if persistence enabled)
await stryng.save();
const loaded: boolean = await stryng.load();

// Get persistence status
const status: string = stryng.getPersistenceStatus(); // 'idle' | 'saving' | 'loading' | 'error'

// Clean up resources
stryng.destroy();
```

### Configuration Options

```typescript
interface StryngOptions {
  // Y.js Document (for multi-document scenarios)
  doc?: Y.Doc;
  
  // Realtime provider configuration
  provider?: 'websocket' | 'supabase';
  serverUrl?: string;
  room?: string;
  token?: string;
  
  // Persistence configuration
  persistence?: boolean | 'supabase';
  docId?: string;
  persistenceOptions?: {
    saveInterval?: number;  // Auto-save interval in ms (default: 5000)
    autoSave?: boolean;     // Enable auto-save (default: true)
    autoLoad?: boolean;     // Auto-load on initialization (default: true)
  };
  
  // Event handlers
  onChange?: (change: ChangeEvent) => void;
  onPersistence?: (event: PersistenceEvent) => void;
  onStatus?: (event: StatusEvent) => void;
  
  // Debug options
  log?: boolean;  // Enable console logging
}
```

## 🏆 Use Cases

- **📝 Collaborative Editors**: Google Docs-style text editors
- **📓 Notebook Applications**: Jupyter-style data science notebooks
- **💬 Chat Applications**: Real-time message composition
- **📋 Form Builders**: Multi-user form creation and editing
- **📑 Wiki Systems**: Collaborative knowledge bases
- **🎨 Code Editors**: Pair programming and code review tools

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Y.js](https://github.com/yjs/yjs)** - The incredible CRDT library powering collaboration
- **[Supabase](https://supabase.com)** - Real-time database and authentication
- **[fast-diff](https://github.com/jhchen/fast-diff)** - Efficient text diffing algorithm
