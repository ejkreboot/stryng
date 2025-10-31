<script>
    import { Stryng } from '../../../dist/index.js';
    import { onMount, onDestroy } from 'svelte';


    // State management
    let textareaValue = $state('');
    let stryng = $state(null);
    let isConnected = $state(false);
    let realtimeStatus = $state('disconnected');
    let persistenceStatus = $state('idle');
    let docId = $state(`demo-${Math.random().toString(36).slice(2, 8)}`);
    let usePersistence = $state(true);
    let lastSaved = $state(null);
    let autoSaveEnabled = $state(true);
    let errorMessage = $state(null);
    let successMessage = $state(null);
    let isInitializing = $state(false);
    let characterCount = $state(0);
    let wordCount = $state(0);
    let activeUsers = $state(1);
    let saveCount = $state(0);
    let lastActivity = $state(new Date());
    
    // Performance optimization state
    let updateTimer = $state(null);
    let statsTimer = $state(null);
    let isTyping = $state(false);
    let pendingValue = $state(null);
    let syncLatency = $state(0);
    let keystrokes = $state(0);
    
    // UI state
    let showSettings = $state(false);
    let showInfo = $state(false);
    
    // Sample documents for quick switching
    const sampleDocs = [
        { 
            id: 'welcome', 
            name: 'Welcome Guide', 
            description: 'Getting started with Stryng',
            template: `🌟 Welcome to Stryng!

Stryng is a real-time collaborative text editing library built on Y.js CRDTs with database persistence.

✨ Key Features:
• Real-time collaborative editing across multiple users
• Automatic database persistence with conflict resolution
• WebSocket and Supabase Realtime providers
• Framework-agnostic TypeScript library
• Built on proven Y.js CRDT technology

🚀 Try it out:
1. Start typing in this editor
2. Open this same document ID in another tab or device
3. Watch your changes sync in real-time!
4. Go offline and come back - changes persist automatically

💡 Pro tip: Share the document ID with others to collaborate instantly.

Happy editing! 🎉`
        },
        { 
            id: 'meeting-notes', 
            name: 'Meeting Notes', 
            description: 'Collaborative meeting notes',
            template: `📅 Team Meeting Notes - ${new Date().toLocaleDateString()}

🎯 **Agenda:**
1. Project updates
2. Sprint planning  
3. Technical discussions
4. Action items

📝 **Discussion Points:**

**Project Status Update:**
- Current milestone: [In Progress]
- Blockers: [None identified]
- Next deadline: [TBD]

**Sprint Planning:**
- User story priorities
- Capacity planning
- Risk assessment

**Technical Topics:**
- Architecture decisions
- Code review process
- Performance optimizations

✅ **Action Items:**
- [ ] Task 1 - Assigned to: [Name] - Due: [Date]
- [ ] Task 2 - Assigned to: [Name] - Due: [Date]
- [ ] Task 3 - Assigned to: [Name] - Due: [Date]

📌 **Next Meeting:** [Date & Time]

---
💡 Tip: Everyone can edit these notes in real-time during the meeting!`
        },
        { 
            id: 'brainstorm', 
            name: 'Brainstorming', 
            description: 'Ideas and thoughts',
            template: `💡 Brainstorming Session

🎯 **Topic:** [What are we brainstorming about?]

🧠 **Wild Ideas (No judgment zone!):**
• Idea 1: [Be creative!]
• Idea 2: [Think outside the box]
• Idea 3: [What if we...?]
• Idea 4: [Crazy but maybe brilliant...]

🔥 **Hot Ideas (Getting warmer...):**
→ Promising concept 1
→ Interesting approach 2
→ Could work if we...

✨ **Golden Ideas (These might be it!):**
⭐ Top contender 1
⭐ Strong possibility 2
⭐ Worth exploring further

🎯 **Next Steps:**
1. Research feasibility
2. Create quick prototypes
3. Get user feedback
4. Decide on implementation

🤝 **Collaboration Notes:**
- Everyone can add ideas simultaneously
- Build on others' thoughts
- Use emojis to react: 👍 👎 🤔 🔥
- No idea is too small or too big

---
Remember: The best ideas often come from combining different perspectives!`
        },
        { 
            id: 'draft', 
            name: 'Document Draft', 
            description: 'Work in progress',
            template: `📄 Document Draft

**Title:** [Your Document Title Here]

**Status:** 🚧 Work in Progress
**Last Updated:** ${new Date().toLocaleDateString()}
**Contributors:** [Add names as people join]

---

## Introduction

[Start writing your introduction here. This collaborative document allows multiple people to edit simultaneously while maintaining a complete revision history.]

## Main Content

### Section 1
[Your content here...]

### Section 2
[More content...]

## Key Points
- Point 1
- Point 2
- Point 3

## Next Steps
- [ ] Complete first draft
- [ ] Review and edit
- [ ] Get feedback from team
- [ ] Finalize and publish

---

## Collaboration Notes
💭 **Comments & Feedback:**
[Team members can add feedback here in real-time]

🔄 **Revision History:**
- All changes are automatically tracked and merged
- No more "version conflicts" or lost work
- Perfect for collaborative writing

✨ **Features:**
- Real-time editing with multiple cursors
- Automatic save to database
- Offline support with sync when reconnected
- Conflict-free collaborative editing (CRDTs)

Happy writing! 📝`
        }
    ];

    // Auto-clear messages
    function showMessage(type, text, duration = 3000) {
        if (type === 'error') {
            errorMessage = text;
            setTimeout(() => errorMessage = null, duration);
        } else {
            successMessage = text;
            setTimeout(() => successMessage = null, duration);
        }
    }

    function updateStats(text) {
        characterCount = text.length;
        wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
        lastActivity = new Date();
    }
    
    // Debounced version for better performance
    function updateStatsDebounced(text) {
        if (statsTimer) {
            clearTimeout(statsTimer);
        }
        
        // Update character count immediately for responsive feel
        characterCount = text.length;
        
        // Debounce word count calculation (more expensive)
        statsTimer = setTimeout(() => {
            wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
            lastActivity = new Date();
            statsTimer = null;
        }, 150);
    }
    
    function onChange(change) {
        console.log('Stryng change:', change);
        if (change.source === 'remote') {
            textareaValue = change.value;
            // Simulate active user detection
            activeUsers = Math.max(1, activeUsers + (Math.random() > 0.7 ? 1 : 0));
        }
        updateStats(change.value);
    }

    function onPersistence(event) {
        console.log('Persistence event:', event);
        persistenceStatus = event.status;
        
        if (event.status === 'idle') {
            if (lastSaved !== 'error') {
                lastSaved = new Date();
                saveCount++;
                showMessage('success', '💾 Document saved successfully');
            }
        } else if (event.status === 'error') {
            lastSaved = 'error';
            console.error('Persistence error:', event.error);
            showMessage('error', `Save failed: ${event.error?.message || 'Unknown error'}`);
        }
    }
    
    onMount(async () => {
        await initializeStryng();
    });

    onDestroy(() => {
        // Cleanup timers
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
        }
        if (statsTimer) {
            clearTimeout(statsTimer);
            statsTimer = null;
        }
        
        // Cleanup Stryng instance
        if (stryng) {
            stryng.destroy();
        }
    });

    async function initializeStryng() {
        if (isInitializing) return;
        isInitializing = true;
        errorMessage = null;
        isConnected = false;
        persistenceStatus = 'idle';
        
        try {
            if (stryng) {
                stryng.destroy();
            }

            if (usePersistence) {
                stryng = await Stryng.createWithPersistence(
                    docId,
                    textareaValue, 
                    onChange,
                    onPersistence,
                    { 
                        provider: "supabase",
                        room: docId,  // Use document ID as room for real-time sync
                        persistenceOptions: {
                            autoSave: autoSaveEnabled,
                            saveInterval: autoSaveEnabled ? 2000 : undefined
                        },
                        onStatus: (event) => {
                            realtimeStatus = event.status;
                            if (event.status === 'connected') {
                                isConnected = true;
                                showMessage('success', '🔗 Connected to real-time sync');
                            } else if (event.status === 'disconnected') {
                                isConnected = false;
                            }
                        }
                    }
                );
            } else {
                stryng = Stryng.create(textareaValue, onChange, { 
                    provider: "supabase",
                    room: docId,  // Use document ID as room for real-time sync
                    onStatus: (event) => {
                        realtimeStatus = event.status;
                        isConnected = event.status === 'connected';
                    }
                });
            }
            
            // Wait for connection and update content
            await stryng.ready;
            textareaValue = stryng.get();
            updateStats(textareaValue);
            isConnected = true;
            
            showMessage('success', `📄 Document "${docId}" loaded successfully`);
            
        } catch (error) {
            console.error('Failed to create Stryng instance:', error);
            showMessage('error', `Failed to initialize: ${error.message}`);
        } finally {
            isInitializing = false;
        }
    }

    // Optimized input handler with debouncing
    function handleInput(event) {
        const newValue = event.target.value;
        textareaValue = newValue;
        pendingValue = newValue;
        isTyping = true;
        
        // Update stats with debouncing for better performance
        updateStatsDebounced(newValue);
        
        // Clear existing timer
        if (updateTimer) {
            clearTimeout(updateTimer);
        }
        
        // Debounce Stryng updates to reduce network calls
        updateTimer = setTimeout(async () => {
            if (stryng && pendingValue !== null) {
                const startTime = performance.now();
                try {
                    await stryng.update(pendingValue);
                    syncLatency = Math.round(performance.now() - startTime);
                    pendingValue = null;
                } catch (error) {
                    console.error('Failed to update Stryng:', error);
                    showMessage('error', 'Failed to sync changes');
                }
            }
            isTyping = false;
            updateTimer = null;
        }, 100); // 100ms debounce - responsive but not overwhelming
        
        // Track keystrokes for performance metrics
        keystrokes++;
    }
    
    // Immediate sync for paste operations or when user stops typing
    async function handleInputBlur() {
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
        }
        
        if (stryng && pendingValue !== null) {
            try {
                await stryng.update(pendingValue);
                pendingValue = null;
            } catch (error) {
                console.error('Failed to update Stryng:', error);
                showMessage('error', 'Failed to sync changes');
            }
        }
        isTyping = false;
    }

    async function manualSave() {
        if (!stryng || !usePersistence) return;
        
        try {
            await stryng.save();
            showMessage('success', '💾 Manual save completed');
        } catch (error) {
            console.error('Manual save failed:', error);
            showMessage('error', `Save failed: ${error.message}`);
        }
    }

    async function manualLoad() {
        if (!stryng || !usePersistence) return;
        
        try {
            const loaded = await stryng.load();
            if (loaded) {
                textareaValue = stryng.get();
                updateStats(textareaValue);
                showMessage('success', '📥 Document reloaded from database');
            } else {
                showMessage('error', 'No saved version found');
            }
        } catch (error) {
            console.error('Manual load failed:', error);
            showMessage('error', `Load failed: ${error.message}`);
        }
    }

    async function switchDocument(newDocId) {
        if (docId === newDocId) return;
        
        // Check if this is a sample document with a template
        const sampleDoc = sampleDocs.find(doc => doc.id === newDocId);
        if (sampleDoc && sampleDoc.template) {
            textareaValue = sampleDoc.template;
        }
        
        docId = newDocId;
        await initializeStryng();
        showSettings = false;
    }

    async function createNewDocument() {
        const newId = `doc-${Date.now().toString(36)}`;
        await switchDocument(newId);
    }

    function copyDocumentId() {
        navigator.clipboard?.writeText(docId);
        showMessage('success', '📋 Document ID copied to clipboard');
    }

    function formatTime(date) {
        if (!date || date === 'error') return 'Error';
        return date.toLocaleTimeString();
    }

    function getStatusIcon(status) {
        switch (status) {
            case 'connected': return '🟢';
            case 'connecting': return '🟡';
            case 'disconnected': return '🔴';
            case 'loading': return '⏳';
            case 'saving': return '💾';
            case 'idle': return '✅';
            case 'error': return '❌';
            default: return '⚪';
        }
    }
</script>

<!-- Header -->
<div class="header">
    <div class="header-content">
        <div class="logo">
            <h1>✨ Stryng</h1>
            <p>Real-time collaborative text editing with database persistence</p>
        </div>
        
        <div class="header-actions">
            <button class="btn-icon" onclick={() => showSettings = !showSettings} title="Settings">
                ⚙️
            </button>
            <button class="btn-icon" onclick={() => showInfo = !showInfo} title="Info">
                ℹ️
            </button>
        </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
        <div class="status-item" class:connected={realtimeStatus === 'connected'}>
            <span class="status-icon">{getStatusIcon(realtimeStatus)}</span>
            <span>Real-time: {realtimeStatus}</span>
        </div>
        
        {#if usePersistence}
            <div class="status-item" class:saving={persistenceStatus === 'saving'} class:connected={persistenceStatus === 'idle'}>
                <span class="status-icon">{getStatusIcon(persistenceStatus)}</span>
                <span>Database: {persistenceStatus}</span>
            </div>
        {/if}
        
        <div class="status-item">
            <span class="status-icon">👥</span>
            <span>{activeUsers} active</span>
        </div>
        
        <div class="status-item">
            <span class="status-icon">📝</span>
            <span>{characterCount} chars, {wordCount} words</span>
        </div>
        
        {#if syncLatency > 0}
            <div class="status-item" class:fast={syncLatency < 50} class:slow={syncLatency > 200}>
                <span class="status-icon">⚡</span>
                <span>{syncLatency}ms sync</span>
            </div>
        {/if}

        {#if usePersistence && lastSaved}
            <div class="status-item">
                <span class="status-icon">💾</span>
                <span>Saved {formatTime(lastSaved)}</span>
            </div>
        {/if}
    </div>
</div>

<!-- Messages -->
{#if errorMessage}
    <div class="message error">
        <span class="message-icon">❌</span>
        <span>{errorMessage}</span>
        <button class="message-close" onclick={() => errorMessage = null}>×</button>
    </div>
{/if}

{#if successMessage}
    <div class="message success">
        <span class="message-icon">✅</span>
        <span>{successMessage}</span>
        <button class="message-close" onclick={() => successMessage = null}>×</button>
    </div>
{/if}

<!-- Settings Panel -->
{#if showSettings}
    <div class="overlay" onclick={() => showSettings = false} onkeydown={(e) => e.key === 'Escape' && (showSettings = false)} role="button" tabindex="0" aria-label="Close settings"></div>
    <div class="panel settings-panel">
        <div class="panel-header">
            <h3>⚙️ Settings</h3>
            <button class="btn-close" onclick={() => showSettings = false}>×</button>
        </div>

        <div class="panel-content">
            <div class="setting-group">
                <h4>📄 Document</h4>
                <div class="input-group">
                    <label for="doc-id-input">Document ID</label>
                    <div class="input-with-button">
                        <input id="doc-id-input" type="text" bind:value={docId} placeholder="Enter document ID" />
                        <button class="btn btn-sm" onclick={copyDocumentId} title="Copy ID">📋</button>
                    </div>
                </div>
                
                <div class="quick-docs">
                    <span class="section-label">Quick Switch:</span>
                    <div class="doc-grid">
                        {#each sampleDocs as doc}
                            <button 
                                class="doc-card {docId === doc.id ? 'active' : ''}"
                                onclick={() => switchDocument(doc.id)}
                            >
                                <div class="doc-name">{doc.name}</div>
                                <div class="doc-desc">{doc.description}</div>
                            </button>
                        {/each}
                    </div>
                    <button class="btn btn-outline" onclick={createNewDocument}>
                        ➕ New Document
                    </button>
                </div>
            </div>

            <div class="setting-group">
                <h4>💾 Persistence</h4>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={usePersistence} />
                    <span class="checkmark"></span>
                    Enable database persistence
                </label>
                
                <label class="checkbox-label" class:disabled={!usePersistence}>
                    <input type="checkbox" bind:checked={autoSaveEnabled} disabled={!usePersistence} />
                    <span class="checkmark"></span>
                    Auto-save changes (2 second delay)
                </label>
            </div>

            <div class="setting-actions">
                <button class="btn btn-primary" onclick={initializeStryng} disabled={isInitializing}>
                    {#if isInitializing}
                        ⏳ Applying...
                    {:else}
                        🔄 Apply Settings
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Info Panel -->
{#if showInfo}
    <div class="overlay" onclick={() => showInfo = false} onkeydown={(e) => e.key === 'Escape' && (showInfo = false)} role="button" tabindex="0" aria-label="Close info panel"></div>
    <div class="panel info-panel">
        <div class="panel-header">
            <h3>ℹ️ Information</h3>
            <button class="btn-close" onclick={() => showInfo = false}>×</button>
        </div>

        <div class="panel-content">
            <div class="info-section">
                <h4>📊 Statistics</h4>
                <div class="stats-grid">
                    <div class="stat">
                        <div class="stat-value">{characterCount}</div>
                        <div class="stat-label">Characters</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{wordCount}</div>
                        <div class="stat-label">Words</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{saveCount}</div>
                        <div class="stat-label">Saves</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{activeUsers}</div>
                        <div class="stat-label">Active Users</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{keystrokes}</div>
                        <div class="stat-label">Keystrokes</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{syncLatency}ms</div>
                        <div class="stat-label">Sync Latency</div>
                    </div>
                </div>
            </div>

            <div class="info-section">
                <h4>🔄 Activity</h4>
                <div class="activity-item">
                    <span>Last activity:</span>
                    <span class="activity-time">{formatTime(lastActivity)}</span>
                </div>
                {#if usePersistence}
                    <div class="activity-item">
                        <span>Last save:</span>
                        <span class="activity-time">{formatTime(lastSaved)}</span>
                    </div>
                {/if}
            </div>

            <div class="info-section">
                <h4>🚀 Features</h4>
                <ul class="feature-list">
                    <li>✨ Real-time collaborative editing</li>
                    <li>💾 Automatic database persistence</li>
                    <li>🔄 Conflict-free merging (CRDTs)</li>
                    <li>📱 Cross-platform synchronization</li>
                    <li>🛡️ Optimistic locking</li>
                </ul>
            </div>
        </div>
    </div>
{/if}

<!-- Main Editor -->
<div class="main-container">
    <div class="editor-container">
        <div class="editor-header">
            <div class="editor-title">
                <span class="doc-icon">📝</span>
                <span class="doc-name">{docId}</span>
            </div>
            
            <div class="editor-actions">
                {#if usePersistence}
                    <button 
                        class="btn btn-sm btn-outline" 
                        onclick={manualLoad} 
                        disabled={!stryng || persistenceStatus === 'loading'}
                        title="Reload from database"
                    >
                        📥 Reload
                    </button>
                    <button 
                        class="btn btn-sm btn-primary" 
                        onclick={manualSave} 
                        disabled={!stryng || persistenceStatus === 'saving'}
                        title="Save to database"
                    >
                        💾 Save
                    </button>
                {/if}
            </div>
        </div>
        
        <div class="editor-wrapper">
            <textarea
                bind:value={textareaValue}
                oninput={handleInput}
                onblur={handleInputBlur}
                onkeydown={(e) => {
                    // Handle special keys for immediate sync
                    if (e.key === 'Enter' || e.key === 'Tab' || (e.ctrlKey && e.key === 'v')) {
                        setTimeout(handleInputBlur, 10);
                    }
                }}
                placeholder="Start typing your collaborative document here...

✨ Features:
• Real-time sync across all devices
• Automatic database persistence  
• Conflict-free collaborative editing
• Multi-user cursor tracking

Try opening this document ID in another tab to see the magic! 🪄"
                disabled={!isConnected || isInitializing}
                class:loading={isInitializing}
            ></textarea>
            
            {#if persistenceStatus === 'saving'}
                <div class="saving-indicator">
                    <span>💾 Saving...</span>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: 
            radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(249, 115, 22, 0.03) 0%, transparent 50%),
            linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%);
        background-size: 100% 100%, 100% 100%, 100% 100%;
        min-height: 100vh;
        color: #334155;
        position: relative;
    }

    :global(body::before) {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: 
            linear-gradient(rgba(148, 163, 184, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.03) 1px, transparent 1px);
        background-size: 50px 50px;
        pointer-events: none;
        z-index: -1;
    }

    /* Header */
    .header {
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 1px 3px rgba(148, 163, 184, 0.1);
    }

    .header-content {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1.5rem 2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .logo h1 {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
        background: linear-gradient(135deg, #1e293b, #475569);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        position: relative;
    }

    .logo h1::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        width: 40px;
        height: 2px;
        background: linear-gradient(90deg, #3b82f6, #f97316);
        border-radius: 1px;
    }

    .logo p {
        margin: 0.25rem 0 0 0;
        font-size: 0.9rem;
        color: #64748b;
        font-weight: 400;
    }

    .header-actions {
        display: flex;
        gap: 0.5rem;
    }

    .btn-icon {
        width: 44px;
        height: 44px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(148, 163, 184, 0.1);
        color: #475569;
    }

    .btn-icon:hover {
        background: rgba(59, 130, 246, 0.05);
        border-color: rgba(59, 130, 246, 0.3);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        color: #3b82f6;
    }

    /* Status Bar */
    .status-bar {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0.75rem 2rem;
        display: flex;
        gap: 2rem;
        flex-wrap: wrap;
        background: rgba(248, 250, 252, 0.8);
        border-top: 1px solid rgba(148, 163, 184, 0.15);
        backdrop-filter: blur(10px);
    }

    .status-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        font-weight: 500;
        color: #475569;
        padding: 0.25rem 0.75rem;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.6);
        border: 1px solid rgba(148, 163, 184, 0.1);
    }

    .status-item.connected {
        border-color: rgba(59, 130, 246, 0.3);
        background: rgba(59, 130, 246, 0.08);
    }
    
    .status-item.saving {
        border-color: rgba(249, 115, 22, 0.3);
        background: rgba(249, 115, 22, 0.08);
    }    .status-item.fast {
        border-color: rgba(34, 197, 94, 0.3);
        background: rgba(34, 197, 94, 0.08);
        color: #16a34a;
    }
    
    .status-item.slow {
        border-color: rgba(249, 115, 22, 0.3);
        background: rgba(249, 115, 22, 0.08);
        color: #ea580c;
    }

    .status-icon {
        font-size: 1rem;
    }

    /* Messages */
    .message {
        position: fixed;
        top: 100px;
        right: 2rem;
        padding: 1rem 1.5rem;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 200;
        backdrop-filter: blur(10px);
        max-width: 400px;
    }

    .message.success {
        background: rgba(255, 255, 255, 0.95);
        color: #1e293b;
        border: 1px solid rgba(59, 130, 246, 0.2);
        box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
    }

    .message.error {
        background: rgba(255, 255, 255, 0.95);
        color: #1e293b;
        border: 1px solid rgba(249, 115, 22, 0.3);
        box-shadow: 0 4px 20px rgba(249, 115, 22, 0.15);
    }

    .message-close {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0;
        margin-left: auto;
    }

    /* Panels */
    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(148, 163, 184, 0.3);
        backdrop-filter: blur(8px);
        z-index: 150;
    }

    .panel {
        position: fixed;
        top: 0;
        bottom: 0;
        width: 400px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        box-shadow: 0 0 40px rgba(148, 163, 184, 0.2);
        border-left: 1px solid rgba(148, 163, 184, 0.2);
        z-index: 160;
        display: flex;
        flex-direction: column;
    }

    .settings-panel {
        right: 0;
    }

    .info-panel {
        left: 0;
    }

    .panel-header {
        padding: 1.5rem 2rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(248, 250, 252, 0.8);
        backdrop-filter: blur(10px);
    }

    .panel-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
    }

    .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }

    .btn-close:hover {
        background: #e5e7eb;
    }

    .panel-content {
        flex: 1;
        padding: 2rem;
        overflow-y: auto;
    }

    /* Settings */
    .setting-group {
        margin-bottom: 2rem;
    }

    .setting-group h4 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: #374151;
    }

    .input-group {
        margin-bottom: 1rem;
    }

    .input-group label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: #4b5563;
        margin-bottom: 0.5rem;
    }

    .input-with-button {
        display: flex;
        gap: 0.5rem;
    }

    .input-with-button input {
        flex: 1;
    }

    input[type="text"] {
        padding: 0.75rem 1rem;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 4px;
        font-size: 0.875rem;
        transition: all 0.2s ease;
        background: rgba(255, 255, 255, 0.9);
        color: #334155;
    }

    input[type="text"]:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        background: white;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        margin-bottom: 0.75rem;
        font-size: 0.875rem;
        font-weight: 500;
    }

    .checkbox-label.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .checkbox-label input[type="checkbox"] {
        display: none;
    }

    .checkmark {
        width: 20px;
        height: 20px;
        border: 1px solid rgba(148, 163, 184, 0.4);
        border-radius: 2px;
        position: relative;
        transition: all 0.2s;
        background: rgba(255, 255, 255, 0.9);
    }

    .checkbox-label input:checked + .checkmark {
        background: #3b82f6;
        border-color: #3b82f6;
    }

    .checkbox-label input:checked + .checkmark::after {
        content: '✓';
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 12px;
        font-weight: 600;
    }

    .quick-docs .section-label {
        display: block;
        margin-bottom: 0.75rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: #4b5563;
    }

    .doc-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .doc-card {
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
    }

    .doc-card:hover {
        border-color: rgba(59, 130, 246, 0.4);
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
        background: rgba(59, 130, 246, 0.02);
    }

    .doc-card.active {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
    }

    .doc-name {
        font-weight: 600;
        font-size: 0.875rem;
        color: #1f2937;
        margin-bottom: 0.25rem;
    }

    .doc-desc {
        font-size: 0.75rem;
        color: #6b7280;
    }

    /* Buttons */
    .btn {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        text-decoration: none;
        justify-content: center;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-sm {
        padding: 0.5rem 1rem;
        font-size: 0.8rem;
    }

    .btn-primary {
        background: linear-gradient(135deg, #3b82f6, #1e40af);
        color: white;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
        border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .btn-primary:hover:not(:disabled) {
        background: linear-gradient(135deg, #2563eb, #1e3a8a);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
    }

    .btn-outline {
        background: rgba(255, 255, 255, 0.9);
        color: #475569;
        border: 1px solid rgba(148, 163, 184, 0.3);
    }

    .btn-outline:hover:not(:disabled) {
        background: rgba(59, 130, 246, 0.05);
        color: #3b82f6;
        border-color: rgba(59, 130, 246, 0.3);
    }

    .setting-actions {
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }

    /* Info Panel */
    .info-section {
        margin-bottom: 2rem;
    }

    .info-section h4 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: #374151;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .stat {
        text-align: center;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 4px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        backdrop-filter: blur(10px);
    }

    .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #3b82f6;
        margin-bottom: 0.25rem;
    }

    .stat-label {
        font-size: 0.75rem;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .activity-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        font-size: 0.875rem;
    }

    .activity-time {
        font-family: 'SF Mono', 'Monaco', monospace;
        color: #6b7280;
    }

    .feature-list {
        margin: 0;
        padding-left: 0;
        list-style: none;
    }

    .feature-list li {
        padding: 0.5rem 0;
        font-size: 0.875rem;
        color: #4b5563;
    }

    /* Main Container */
    .main-container {
        max-width: 1200px;
        margin: 2rem auto;
        padding: 0 2rem;
    }

    .editor-container {
        background: rgba(255, 255, 255, 0.9);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(148, 163, 184, 0.15);
        overflow: hidden;
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.2);
        transition: all 0.3s ease;
    }

    .editor-container:focus-within {
        box-shadow: 
            0 8px 32px rgba(148, 163, 184, 0.2),
            0 0 0 1px rgba(59, 130, 246, 0.2),
            0 0 20px rgba(59, 130, 246, 0.1);
    }

    .editor-header {
        padding: 1.5rem 2rem;
        background: linear-gradient(135deg, rgba(248, 250, 252, 0.9), rgba(241, 245, 249, 0.8));
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        backdrop-filter: blur(10px);
    }

    .editor-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .doc-icon {
        font-size: 1.25rem;
    }

    .doc-name {
        font-weight: 600;
        color: #1e293b;
        font-size: 1.1rem;
    }

    .editor-actions {
        display: flex;
        gap: 0.75rem;
    }

    .editor-wrapper {
        position: relative;
        min-height: 500px;
    }

    textarea {
        width: 100%;
        height: 500px;
        border: none;
        padding: 2rem;
        font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
        font-size: 1rem;
        line-height: 1.6;
        resize: vertical;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(248, 250, 252, 0.3));
        color: #334155;
        box-sizing: border-box;
    }

    textarea:focus {
        outline: none;
        background: rgba(255, 255, 255, 0.2);
        box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.2);
    }

    textarea::placeholder {
        color: #94a3b8;
        font-style: italic;
    }

    textarea:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    textarea.loading {
        background: rgba(248, 250, 252, 0.5);
        opacity: 0.7;
    }

    .saving-indicator {
        position: absolute;
        bottom: 1rem;
        right: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 500;
        backdrop-filter: blur(10px);
        background: rgba(249, 115, 22, 0.95);
        color: white;
        border: 1px solid rgba(249, 115, 22, 0.3);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    /* Minimal animations removed for performance */

    /* Responsive */
    @media (max-width: 768px) {
        .header-content {
            padding: 1rem;
            flex-direction: column;
            gap: 1rem;
        }

        .status-bar {
            padding: 1rem;
            flex-direction: column;
            gap: 0.5rem;
        }

        .panel {
            width: 100%;
            max-width: 400px;
        }

        .main-container {
            margin: 1rem auto;
            padding: 0 1rem;
        }

        .editor-header {
            padding: 1rem;
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .editor-actions {
            justify-content: center;
        }

        textarea {
            padding: 1rem;
        }

        .doc-grid {
            grid-template-columns: 1fr;
        }

        .stats-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>