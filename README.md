# Stryng 🪄

A reactive string that synchronizes in real-time across multiple clients using [Yjs](https://yjs.dev/) CRDT technology.

## Features

- **Real-time synchronization** across multiple clients
- **Conflict-free collaborative editing** with automatic merge resolution
- **Multiple transport options**: WebRTC, WebSocket, and Supabase
- **Offline persistence** with IndexedDB support
- **Simple API** - works like a regular string but syncs everywhere
- **Efficient diffing** using fast-diff for minimal network overhead
- **Debouncing support** to reduce update frequency
- **Zero configuration** for basic usage

## Installation

```bash
npm install stryng yjs
```

Optional peer dependencies for different transports:
```bash
# For WebRTC transport (default)
npm install y-webrtc

# For WebSocket transport  
npm install y-websocket

# For Supabase transport
npm install @supabase/supabase-js
```

## Quick Start

### Basic Usage

```javascript
import { Stryng } from 'stryng';

// Create a reactive string
const s = Stryng.create({ initial: 'Hello' });

// Update the string
await s('Hello, World!');

// Get current value
console.log(`${s}`); // "Hello, World!"

// Subscribe to changes
const unsubscribe = s.subscribe(value => {
  console.log('String updated:', value);
});
```

### Real-time Collaboration

```javascript
// Multiple clients can share the same string by using the same room
const s = Stryng.create({
  room: 'my-shared-document',
  initial: 'Collaborative text'
});

// Changes from any client will sync automatically
await s('Updated from client A');
// Other clients will receive this update instantly
```

## Transport Options

### WebRTC (Default)
Best for peer-to-peer applications:

```javascript
const s = Stryng.create({
  transport: 'webrtc',
  room: 'my-room',
  webrtc: {
    signaling: ['wss://signaling.yjs.dev'],
    password: 'optional-password'
  }
});
```

### WebSocket
Good for server-mediated sync:

```javascript
const s = Stryng.create({
  transport: 'websocket',
  room: 'my-room',
  websocket: {
    url: 'wss://demos.yjs.dev',
    params: { token: 'auth-token' }
  }
});
```

### Supabase
Perfect for scalable real-time apps:

```javascript
const s = Stryng.create({
  transport: 'supabase',
  room: 'my-room',
  supabase: {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key'
  }
});
```

## API Reference

### `Stryng.create(options)`

Creates a new Stryng instance.

**Options:**
- `initial?: string` - Initial string value (default: `''`)
- `room?: string` - Room name for synchronization (default: `'stryng'`)
- `transport?: 'webrtc' | 'websocket' | 'supabase'` - Transport method (default: `'webrtc'`)
- `indexeddb?: boolean` - Enable offline persistence (default: `true`)
- `connect?: boolean` - Auto-connect to sync (default: `true`)
- `debounceMs?: number` - Debounce updates in milliseconds (default: `0`)
- `ydoc?: Y.Doc` - Custom Yjs document
- `key?: string` - Key for the text in the Yjs document
- `provider?: object` - Custom provider instance

**Transport-specific options:**
- `webrtc?: { signaling?: string[], password?: string }`
- `websocket?: { url?: string, params?: Record<string,string> }`
- `supabase?: { url?: string, anonKey?: string, client?: SupabaseClient }`

### Instance Methods

```javascript
// Update the string
await stryng('new value');

// Get current value
const value = `${stryng}`;

// Subscribe to changes
const unsubscribe = stryng.subscribe(value => {
  console.log('Updated:', value);
});

// Cleanup
stryng.destroy();
```

## Examples

### Text Editor with Real-time Sync

```javascript
import { Stryng } from 'stryng';

const editor = document.getElementById('editor');
const stryng = Stryng.create({
  room: 'shared-document',
  debounceMs: 300 // Debounce rapid typing
});

// Sync editor content with Stryng
stryng.subscribe(value => {
  if (editor.value !== value) {
    editor.value = value;
  }
});

// Update Stryng when user types
editor.addEventListener('input', () => {
  stryng(editor.value);
});
```

### Chat Messages

```javascript
const messages = Stryng.create({
  room: 'chat-room',
  transport: 'supabase',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  }
});

// Add new message
async function sendMessage(text) {
  const current = `${messages}`;
  const timestamp = new Date().toISOString();
  await messages(current + `\n[${timestamp}] ${text}`);
}

// Listen for new messages
messages.subscribe(allMessages => {
  displayMessages(allMessages.split('\n'));
});
```

## Advanced Usage

### Custom Yjs Document

```javascript
import * as Y from 'yjs';

const ydoc = new Y.Doc();
const stryng = Stryng.create({
  ydoc,
  key: 'my-text-field'
});

// Access underlying Yjs objects
console.log(stryng.ydoc); // Y.Doc
console.log(stryng.ytext); // Y.Text
```

### Multiple Strings in One Document

```javascript
const ydoc = new Y.Doc();

const title = Stryng.create({ ydoc, key: 'title' });
const content = Stryng.create({ ydoc, key: 'content' });

// Both share the same document and sync together
```

## Browser Support

- Modern browsers with ES2020+ support
- WebRTC requires HTTPS in production
- IndexedDB available in all modern browsers

## Contributing

Contributions welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © Eric J. Kort

## Related Projects

- [Yjs](https://yjs.dev/) - The underlying CRDT library
- [y-webrtc](https://github.com/yjs/y-webrtc) - WebRTC provider for Yjs
- [y-websocket](https://github.com/yjs/y-websocket) - WebSocket provider for Yjs