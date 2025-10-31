#!/bin/bash

# Stryng Demo Setup Script
# This script helps set up the Supabase database schema for the demo

echo "🚀 Setting up Stryng Demo Database Schema"
echo "=========================================="
echo

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Please create a .env file with your Supabase credentials:"
    echo "VITE_SUPABASE_URL=https://your-project.supabase.co"
    echo "VITE_SUPABASE_ANON_KEY=your-anon-key"
    exit 1
fi

# Source the .env file
if [ -f ".env" ]; then
    export $(cat .env | xargs)
fi

# Check if required environment variables are set
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    echo "❌ Missing environment variables!"
    echo "Make sure your .env file contains:"
    echo "VITE_SUPABASE_URL=https://your-project.supabase.co"
    echo "VITE_SUPABASE_ANON_KEY=your-anon-key"
    exit 1
fi

echo "✅ Environment variables found"
echo "📦 Supabase URL: $VITE_SUPABASE_URL"
echo

# Check if npm/node is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found! Please install Node.js and npm"
    exit 1
fi

echo "📋 Manual Setup Instructions:"
echo "1. Open your Supabase dashboard: $VITE_SUPABASE_URL"
echo "2. Go to the 'SQL Editor' tab"
echo "3. Create a new query and paste the contents of '../schema.sql'"
echo "4. Execute the query to create the required tables"
echo
echo "5. Then run: npm install && npm run dev"
echo "6. Open: http://localhost:5173"
echo

echo "🎉 Ready to start developing!"
echo "The demo will have full persistence and real-time collaboration enabled."
echo

# Offer to open the schema file
read -p "Would you like to view the schema file content? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📄 Schema file content:"
    echo "======================="
    cat ../schema.sql
    echo
    echo "======================="
fi

echo "Happy coding! 🚀"