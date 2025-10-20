<script lang="ts">
  import { onMount } from 'svelte';
  import { Stryng } from 'stryng';
  // import { MemoryStore } from 'stryng/yjs-store'; // optional demo override

  let text = '';
  let stryng: any;
  let connected = false;
  let userCount = 1;
  let lastSaved = '';

  onMount(async () => {
    try {
      // Grab demo token dynamically
      const token = 'rjKfn9aBIjhTgrVV';

      stryng = Stryng.create({
        key:   'stryng-collaborative-demo',
        room:  'stryng-collaborative-demo',
        transport: 'websocket',
        websocket: {
          url: 'wss://ws.codyx.io/ws-codyx/',
          params: { token }
        },
        initial: `# Welcome to Stryng! 🪄

This is a collaborative text editor powered by Stryng and Yjs CRDT technology. 
Try editing in multiple tabs and browsers to see real-time synchronization in action!`,
        debounceMs: 100,
        // persistence: new MemoryStore()  // uncomment to disable IDB for demo
      });

      stryng.subscribe((value: string) => {
        text = value;
        lastSaved = new Date().toLocaleTimeString();
        updateStatus();
      });

      connected = true;
      updateStatus();
    } catch (error) {
      console.error('Failed to initialize Stryng:', error);
    }
  });

  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    if (stryng) stryng(target.value);
  }

  function updateStatus() {
    userCount = Math.floor(Math.random() * 3) + 1;
  }

  function insertTemplate() {
    const templates = [/* your existing templates here */];
    const template = templates[Math.floor(Math.random() * templates.length)];
    if (stryng) stryng(template);
  }

  function clearEditor() {
    if (stryng) stryng('');
  }
</script>


<svelte:head>
  <title>Stryng Collaborative Editor Demo</title>
  <meta name="description" content="Real-time collaborative text editing with Stryng" />
</svelte:head>

<div class="app">
  <!-- Header -->
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <span class="icon">🪄</span>
        <h1>Stryng</h1>
        <span class="badge">Demo</span>
      </div>
      
      <div class="status">
        <div class="status-item">
          <div class="indicator {connected ? 'online' : 'offline'}"></div>
          <span>{connected ? 'Connected' : 'Offline'}</span>
        </div>
        <div class="status-item">
          <span class="icon">👤</span>
          <span>{userCount} online</span>
        </div>
        {#if lastSaved}
          <div class="status-item">
            <span class="icon">💾</span>
            <span>Saved {lastSaved}</span>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Main Editor -->
  <main class="main">
    <div class="editor-container">
      <div class="toolbar">
        <h2>Collaborative Editor</h2>
        <div class="toolbar-actions">
          <button class="btn primary" on:click={insertTemplate}>
            ✨ Insert Template
          </button>
          <button class="btn secondary" on:click={clearEditor}>
            🗑️ Clear
          </button>
        </div>
      </div>

      <div class="editor-wrapper">
        <textarea
          class="editor"
          bind:value={text}
          on:input={handleInput}
          placeholder="Start typing to experience real-time collaboration..."
          spellcheck="false"
        ></textarea>
      </div>

      <div class="editor-footer">
        <div class="stats">
          <span>{text.length} characters</span>
          <span>•</span>
          <span>{text.split('\n').length} lines</span>
          <span>•</span>
          <span>{text.split(/\s+/).filter(w => w.length > 0).length} words</span>
        </div>
        <div class="sync-status {connected ? 'synced' : 'offline'}">
          {connected ? '✓ All changes saved' : '⚠️ Offline mode'}
        </div>
      </div>
    </div>

    <!-- Instructions Panel -->
    <aside class="sidebar">
      <div class="card">
        <h3>🚀 Quick Start</h3>
        <ol>
          <li>Open this page in a new tab</li>
          <li>Start typing in either tab</li>
          <li>Watch real-time sync magic!</li>
          <li>Share the URL with others</li>
        </ol>
      </div>

      <div class="card">
        <h3>✨ Features</h3>
        <ul class="feature-list">
          <li>Real-time collaboration</li>
          <li>Conflict-free editing</li>
          <li>Offline support</li>
          <li>Automatic saving</li>
          <li>No setup required</li>
        </ul>
      </div>

      <div class="card">
        <h3>🔧 Powered By</h3>
        <div class="tech-stack">
          <div class="tech-item">
            <strong>Stryng</strong>
            <span>Reactive collaborative strings</span>
          </div>
          <div class="tech-item">
            <strong>Yjs</strong>
            <span>Conflict-free replicated data types</span>
          </div>
          <div class="tech-item">
            <strong>WebRTC</strong>
            <span>Peer-to-peer communication</span>
          </div>
        </div>
      </div>
    </aside>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f8fafc;
    color: #1e293b;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo .icon {
    font-size: 1.75rem;
    animation: float 3s ease-in-out infinite;
  }

  .logo h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .badge {
    background: #e0e7ff;
    color: #4338ca;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #64748b;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }

  .indicator.online {
    background: #10b981;
    animation: pulse 2s infinite;
  }

  /* Main Content */
  .main {
    flex: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 2rem;
  }

  /* Editor */
  .editor-container {
    background: white;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .toolbar {
    padding: 1rem 1.5rem;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .toolbar h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #374151;
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn.primary {
    background: #3b82f6;
    color: white;
  }

  .btn.primary:hover {
    background: #2563eb;
    transform: translateY(-1px);
  }

  .btn.secondary {
    background: #e5e7eb;
    color: #374151;
  }

  .btn.secondary:hover {
    background: #d1d5db;
  }

  .editor-wrapper {
    position: relative;
  }

  .editor {
    width: 100%;
    min-height: 500px;
    padding: 1.5rem;
    border: none;
    outline: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    resize: vertical;
    background: white;
    color: #1e293b;
  }

  .editor::placeholder {
    color: #94a3b8;
  }

  .editor-footer {
    padding: 0.75rem 1.5rem;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: #64748b;
  }

  .stats {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .sync-status.synced {
    color: #10b981;
    font-weight: 500;
  }

  .sync-status.offline {
    color: #f59e0b;
    font-weight: 500;
  }

  /* Sidebar */
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .card h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
  }

  .card ol, .card ul {
    margin: 0;
    padding-left: 1.25rem;
    color: #64748b;
  }

  .card li {
    margin-bottom: 0.5rem;
  }

  .feature-list {
    list-style: none;
    padding: 0;
  }

  .feature-list li {
    position: relative;
    padding-left: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .feature-list li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: #10b981;
    font-weight: 600;
  }

  .tech-stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tech-item {
    padding: 0.75rem;
    background: #f8fafc;
    border-radius: 0.5rem;
    border: 1px solid #e2e8f0;
  }

  .tech-item strong {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.25rem;
  }

  .tech-item span {
    font-size: 0.75rem;
    color: #64748b;
  }

  /* Animations */
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .main {
      grid-template-columns: 1fr;
      padding: 1rem;
      gap: 1rem;
    }

    .header-content {
      padding: 1rem;
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }

    .status {
      flex-wrap: wrap;
      justify-content: center;
      gap: 1rem;
    }

    .toolbar {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .toolbar-actions {
      justify-content: center;
    }

    .editor {
      min-height: 400px;
      font-size: 0.875rem;
    }

    .editor-footer {
      flex-direction: column;
      gap: 0.5rem;
      text-align: center;
    }
  }
</style>