import { createClient } from '@supabase/supabase-js'
import type { GameChannel } from './localChannel'
import { createLocalChannel } from './localChannel'

export type { GameChannel }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = (import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null

// selfId is needed so the local fallback can exclude own broadcasts (self: false semantics)
export function getRoomChannel(roomCode: string, selfId?: string): GameChannel {
  if (supabase) {
    // Cast: Supabase RealtimeChannel has the same methods we use; types differ only in generics
    return supabase.channel(`draw-battle:room:${roomCode}`, {
      config: { broadcast: { self: false } }
    }) as unknown as GameChannel
  }
  return createLocalChannel(roomCode, selfId ?? 'unknown')
}
