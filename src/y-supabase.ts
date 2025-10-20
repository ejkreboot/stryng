// y-supabase.ts
import * as Y from 'yjs';
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';

export type YSupabaseOpts = {
  doc: Y.Doc;
  room: string;
  supabase?: SupabaseClient;
  url?: string;
  anonKey?: string;
  selfBroadcast?: boolean;
};

const toB64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export class YSupabaseProvider {
  #doc: Y.Doc;
  #ch!: RealtimeChannel;
  #client!: SupabaseClient;
  #joined = false;
  #connecting = false;
  #unsubDoc?: () => void;
  #room: string;
  
  constructor({ doc, room, supabase, url, anonKey}: YSupabaseOpts) {
    if (!supabase && (!url || !anonKey)) throw new Error('YSupabaseProvider: pass supabase OR url+anonKey');
    this.#client = supabase ?? createClient(url!, anonKey!);
    this.#doc = doc;
    this.#room = room;
  }
  
  // y-supabase.ts
  async connect() {
    if (this.#joined || this.#connecting) return;
    this.#connecting = true;
    
    try {
      this.#ch = this.#client.channel(this.#room, {
        config: {  broadcast: { self: false, ack: false} }
      });
        
    // Inbound handlers
    this.#ch.on('broadcast', { event: 'y-update' }, ({ payload }) => {
      try {
        const u = fromB64(payload.update);
        Y.applyUpdate(this.#doc, u, /* origin */ this);   // <— tag origin
      } catch (e) {
        console.warn('[YSupa] apply update failed', e);
      }
    });
    
    this.#ch.on('broadcast', { event: 'y-sync-req' }, ({ payload }) => {
      try {
        const sv = fromB64(payload.stateVector);
        const diff = Y.encodeStateAsUpdate(this.#doc, sv);
        this.#ch.send({ type: 'broadcast', event: 'y-sync-resp', payload: { update: toB64(diff) } });
      } catch (e) {
        console.warn('[YSupa] sync-req failed', e);
      }
    });
    
    this.#ch.on('broadcast', { event: 'y-sync-resp' }, ({ payload }) => {
      try {
        const u = fromB64(payload.update);
        Y.applyUpdate(this.#doc, u);
      } catch (e) {
        console.warn('[YSupa] apply sync-resp failed', e);
      }
    });
    
    // Wait for channel to be subscribed
    await new Promise<void>((resolve, reject) => {
      this.#ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR') reject(new Error('Realtime channel error'));
      });
      });
      this.#joined = true;
      
      // Attach Yjs doc update listener AFTER joined
      const onUpdate = (_u: Uint8Array, _origin: unknown, _doc: Y.Doc, tr: any) => {
        // Only send if this change originated locally (not from applyUpdate)
        if (!tr?.local) return;
        this.#ch.send({
          type: 'broadcast',
          event: 'y-update',
          payload: { update: toB64(_u) }
        }).catch((e) => {
          console.warn('[YSupa] Failed to send update:', e);
        });
      };

      this.#doc.on('update', onUpdate);
      this.#unsubDoc = () => this.#doc.off('update', onUpdate);
      
      // Kick initial sync
      const sv = Y.encodeStateVector(this.#doc);
      await this.#ch.send({ type: 'broadcast', event: 'y-sync-req', payload: { stateVector: toB64(sv) } });
    } finally {
      this.#connecting = false;
    }
  }
  
  disconnect() {
    this.#unsubDoc?.();
    this.#unsubDoc = undefined;
    
    if (this.#ch) {
      try { 
        this.#ch.unsubscribe(); 
      } catch (e) {
        console.warn('[YSupa] unsubscribe failed:', e);
      }
      this.#ch = null as any;
    }
    
    this.#joined = false;
    this.#connecting = false;
  }
  
  destroy() { this.disconnect(); }
}
