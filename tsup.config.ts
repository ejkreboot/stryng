import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'yjs',
    'y-indexeddb',
    'y-webrtc',
    'y-websocket',
    '@supabase/supabase-js'
  ],
  treeshake: true,
  minify: false
});
