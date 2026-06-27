import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null

export function getRoomChannel(roomCode: string) {
  if (!supabase) return null
  return supabase.channel(`draw-battle:room:${roomCode}`, {
    config: { broadcast: { self: false } }
  })
}
