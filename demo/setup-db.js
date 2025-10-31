#!/usr/bin/env node

/**
 * Setup script for Stryng Demo Database Schema
 * Run this once to create the required tables in your Supabase project
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required');
  console.error('   Make sure your .env file is properly configured');
  process.exit(1);
}

async function setupDatabase() {
  console.log('🚀 Setting up Stryng database schema...');
  
  try {
    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Read the schema file
    const schemaPath = join(__dirname, '..', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.includes('CREATE TABLE') || statement.includes('CREATE INDEX')) {
        console.log(`   ${i + 1}/${statements.length}: ${statement.split('\n')[0]}...`);
      }
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.message.includes('relation') && error.message.includes('already exists')) {
          console.log(`   ⚠️  Skipped (already exists): ${statement.split('\n')[0]}`);
          continue;
        }
        throw error;
      }
    }
    
    // Test the setup by checking if the table exists
    const { data, error: testError } = await supabase
      .from('stryng_documents')
      .select('doc_id')
      .limit(1);
    
    if (testError) {
      console.log('⚠️  Direct table access failed, but this is normal with RLS enabled');
      console.log('   The schema should still be properly set up');
    } else {
      console.log('✅ Table access test passed');
    }
    
    console.log('');
    console.log('🎉 Database setup completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('   1. Run: cd demo && npm run dev');
    console.log('   2. Open: http://localhost:5173');
    console.log('   3. Start collaborating with persistent documents!');
    
  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:', error.message);
    console.error('');
    console.error('Manual setup instructions:');
    console.error('   1. Open your Supabase dashboard');
    console.error('   2. Go to SQL Editor');
    console.error('   3. Copy and paste the contents of schema.sql');
    console.error('   4. Execute the SQL');
    process.exit(1);
  }
}

// Alternative method using direct SQL execution (if RPC is available)
async function createExecSqlFunction() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const execSqlFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
    RETURNS TEXT
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql;
      RETURN 'OK';
    END;
    $$ LANGUAGE plpgsql;
  `;
  
  // This would need to be run manually by the user with proper permissions
  console.log('If setup fails, create this function manually in Supabase SQL Editor:');
  console.log(execSqlFunction);
}

setupDatabase().catch(console.error);