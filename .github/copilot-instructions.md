# Stryng - Real-time Collaborative Text Editing Library

## Architecture Overview

Stryng is a TypeScript library for real-time collaborative text editing built on **Yjs CRDTs** with pluggable realtime providers. The core abstraction is the `Stryng` class that wraps a `Y.Text` instance and manages synchronization through provider interfaces.

### Key Components

- **`src/Stryng.ts`**: Main API class exposing `get()`, `update()`, and event handling
- **`src/realtime/`**: Provider pattern for different transport layers
  - `RealtimeProvider.ts`: Abstract base class defining provider contract
  - `WebsocketRealtime.ts`: Uses `y-websocket` provider (default: `wss://ws.codyx.io`)  
  - `SupabaseRealtime.ts`: Custom Supabase Realtime implementation with sync protocol
- **`demo/`**: SvelteKit demo app showing integration patterns

## Key Patterns

### Provider Pattern Implementation
```typescript
// Providers extend Realtime base class
export abstract class Realtime {
  protected abstract sendUpdate(update: Uint8Array): void;
  protected applyRemote(update: Uint8Array) { Y.applyUpdate(this.doc, update); }
}

// Usage in Stryng constructor
if (provider == "websocket") {
    this.provider = new WebsocketRealtime(this.doc);
} else if (provider == "supabase") {
    this.provider = new SupabaseRealtime(this.doc); 
}
```

### Delta-Based Updates
Stryng uses `fast-diff` for efficient text synchronization, converting string diffs to Yjs delta operations. Critical performance optimization: replaces entire text if >60% changed.

### Supabase Sync Protocol
The Supabase provider implements a custom sync handshake:
- `y-sync-ask`: Request state vector from peers
- `y-sync`: Respond with state update
- Built-in retry logic with exponential backoff

## Development Workflow

### Library Development
```bash
npm run dev          # TypeScript watch mode for src/
npm run build        # Compile to dist/
npm run prepack      # Full build + svelte-package + publint
```

### Demo Development  
```bash
cd demo/
npm run dev          # SvelteKit dev server
```

### Testing & Quality
```bash
npm run test         # Vitest unit tests
npm run lint         # ESLint + Prettier
npm run check        # Svelte type checking
```

## Critical Integration Points

### Environment Variables (Supabase)
The SupabaseRealtime provider expects:
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Public anonymous key

### Peer Dependencies
Must be installed by consumers:
- `@supabase/supabase-js ^2.45.0` (for Supabase provider)
- `y-websocket ^1.5.0` (for WebSocket provider)  
- `yjs ^13.6.0` (CRDT foundation)
- `svelte ^5.0.0` (if using in Svelte apps)

### Change Event Handling
```typescript
const stryng = Stryng.create('initial text', (change: ChangeEvent) => {
  // change.source: 'local' | 'remote'  
  // change.delta: Yjs delta operations
  // change.value: current text state
});
```

## File Structure Conventions

- `src/index.ts`: Main export barrel
- `src/Stryng.ts`: Core class implementation  
- `src/realtime/index.ts`: Provider exports
- Library outputs to `dist/` via TypeScript compilation
- Demo in separate `demo/` workspace with own package.json

## Future Architecture Considerations

### Database Persistence (Not Yet Implemented)
Current architecture is purely real-time with no persistence. Future implementation needs:
- **Conflict Resolution**: Database writes must sync with concurrent peer updates via CRDTs
- **Traffic Optimization**: Debounced/batched database writes to minimize I/O
- **State Reconciliation**: Handle cases where database state diverges from real-time state
- **Provider Pattern Extension**: Database persistence as another provider type

### Multi-Stryng Documents (Design Target)
Architecture should scale to support many Stryng instances within larger documents:
- **Atomic Updates**: Single Y.Doc containing multiple Y.Text instances for efficiency
- **Selective Synchronization**: Only sync changed text sections, not entire documents
- **Namespace Management**: Clear separation between different text areas/cells
- **Event Granularity**: Change events should specify which Stryng instance changed

```typescript
// Future multi-stryng pattern
const doc = new Y.Doc();
const notebook = {
  cell1: doc.getText('cell-1'),
  cell2: doc.getText('cell-2'),
  // ... efficient sharing of Y.Doc across cells
};
```

## Important Notes

- Uses Svelte 5's new `$state` runes in demo (not legacy reactive syntax)
- WebSocket provider delegates to `y-websocket`; Supabase provider is custom implementation
- Provider status events: `'connecting' | 'connected' | 'disconnected'`
- All providers handle connection lifecycle and automatic reconnection
- The library is framework-agnostic; Svelte integration shown in demo only