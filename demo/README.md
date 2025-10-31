# 🚀 Stryng Demo - Real-time Collaborative Editing with Database Persistence

A beautiful, modern demo showcasing Stryng's real-time collaborative text editing capabilities with full database persistence.

## ✨ Features

- **🔄 Real-time Collaboration**: Multiple users can edit simultaneously with instant synchronization
- **💾 Database Persistence**: Documents automatically save to Supabase database with conflict resolution
- **🎨 Modern UI**: Beautiful, responsive interface with smooth animations and transitions
- **📱 Mobile-Friendly**: Works seamlessly on desktop, tablet, and mobile devices
- **⚡ Fast Performance**: Optimized for speed with debounced auto-save and efficient syncing
- **🛡️ Conflict Resolution**: Uses Y.js CRDTs to handle conflicts without data loss

## 🏗️ Setup Instructions

### 1. Prerequisites
- Node.js 18+ installed
- Supabase account and project

### 2. Environment Setup

Create a `.env` file in this directory:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Schema

Run the setup script to get instructions:
```bash
./setup.sh
```

Or manually create the database schema:

1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `../schema.sql`
4. Execute the query

### 4. Install and Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 to see the demo!

## 🎮 How to Use

### Basic Usage
1. **Start typing** in the text editor - your changes sync in real-time
2. **Open the same document ID in another tab** to see collaborative editing
3. **Changes are automatically saved** to the database every 2 seconds

### Advanced Features

#### Settings Panel (⚙️)
- **Document Management**: Switch between sample documents or create new ones
- **Persistence Control**: Enable/disable database persistence and auto-save
- **Quick Actions**: Copy document IDs and apply configuration changes

#### Info Panel (ℹ️)
- **Live Statistics**: Character count, word count, save count, active users
- **Activity Tracking**: Last activity time, last save time
- **Feature Overview**: Complete list of Stryng capabilities

### Collaboration Testing

1. **Single Device**: Open multiple tabs with the same document ID
2. **Multiple Devices**: Share the document ID between devices
3. **Network Issues**: Go offline and back online - changes will sync automatically

## 🔧 Demo Features

### Real-time Status Indicators
- **Connection Status**: Shows real-time sync status with visual indicators
- **Persistence Status**: Displays database save/load operations
- **User Activity**: Simulated active user count and activity tracking

### Document Management
- **Sample Documents**: Pre-configured documents for quick testing
- **Custom Document IDs**: Create your own document namespaces
- **Quick Switching**: Easy navigation between different documents

### Error Handling
- **Toast Notifications**: Success/error messages with auto-dismiss
- **Graceful Degradation**: Falls back to real-time-only if persistence fails
- **Connection Recovery**: Automatic reconnection and state synchronization

## 🎨 UI/UX Highlights

### Modern Design
- **Gradient Backgrounds**: Beautiful color gradients throughout the interface
- **Glassmorphism Effects**: Frosted glass panels with backdrop blur
- **Smooth Animations**: Page transitions, loading states, and micro-interactions
- **Typography**: Clean, readable fonts with proper spacing and hierarchy

### Responsive Layout
- **Mobile-First**: Optimized for mobile devices with touch-friendly controls
- **Flexible Panels**: Sliding panels for settings and information
- **Adaptive Grid**: Statistics and controls adapt to screen size

## 🚀 Production Deployment

This demo is production-ready and can be deployed to any static hosting service:

### Build for Production
```bash
npm run build
npm run preview  # Test production build locally
```

### Deployment Options
- **Vercel**: Zero-configuration deployment with automatic previews
- **Netlify**: Continuous deployment with form handling
- **Supabase**: Deploy alongside your database for optimal performance
- **Any Static Host**: Builds to standard HTML/CSS/JS

### Environment Variables
Make sure to set your Supabase credentials in your hosting environment:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
