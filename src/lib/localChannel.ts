/**
 * BroadcastChannel-based local channel that mimics the Supabase Realtime
 * channel API used by this game. Works across tabs on the same origin
 * (localhost) with no external service required.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (payload: { payload: any }) => void
type PresenceHandler = () => void
type StatusHandler = (status: string) => void

// Minimal channel interface shared between Supabase Realtime and BroadcastChannel fallback
export interface GameChannel {
  on(type: 'presence', filter: { event: string }, handler: PresenceHandler): GameChannel
  on(type: 'broadcast', filter: { event: string }, handler: EventHandler): GameChannel
  subscribe(handler: StatusHandler): GameChannel
  track(data: Record<string, unknown>): void
  send(msg: { type: string; event: string; payload: unknown }): void | Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presenceState(): Record<string, any[]>
  unsubscribe(): void
}

// Shared presence store in localStorage: key → {playerId, name, status}[]
const PRESENCE_LS_KEY = (room: string) => `draw-battle:presence:${room}`

function readPresence(room: string): Record<string, { playerId: string; name: string; status: string }[]> {
  try {
    return JSON.parse(localStorage.getItem(PRESENCE_LS_KEY(room)) ?? '{}')
  } catch {
    return {}
  }
}

function writePresence(room: string, state: Record<string, unknown>) {
  localStorage.setItem(PRESENCE_LS_KEY(room), JSON.stringify(state))
}

export interface LocalChannel extends GameChannel {
  on(type: 'presence', filter: { event: string }, handler: PresenceHandler): LocalChannel
  on(type: 'broadcast', filter: { event: string }, handler: EventHandler): LocalChannel
  subscribe(handler: StatusHandler): LocalChannel
}

export function createLocalChannel(roomCode: string, selfId: string): LocalChannel {
  const bc = new BroadcastChannel(`draw-battle:room:${roomCode}`)

  const presenceHandlers: PresenceHandler[] = []
  const broadcastHandlers = new Map<string, EventHandler[]>()

  let trackedData: { playerId: string; name: string; status: string } | null = null

  function fireSyncHandlers() {
    for (const h of presenceHandlers) h()
  }

  // Listen for messages from other tabs
  bc.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as { _type: string; event?: string; payload?: unknown }

    if (msg._type === 'broadcast' && msg.event) {
      const handlers = broadcastHandlers.get(msg.event) ?? []
      for (const h of handlers) h({ payload: msg.payload as unknown })
    }

    if (msg._type === 'presence_update') {
      fireSyncHandlers()
    }
  }

  // Also sync presence from localStorage changes (other tabs writing to it)
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === PRESENCE_LS_KEY(roomCode)) {
      fireSyncHandlers()
    }
  }
  window.addEventListener('storage', onStorage)

  const channel: LocalChannel = {
    on(type: string, filter: { event: string }, handler: PresenceHandler | EventHandler): LocalChannel {
      if (type === 'presence') {
        presenceHandlers.push(handler as PresenceHandler)
      } else if (type === 'broadcast') {
        const arr = broadcastHandlers.get(filter.event) ?? []
        arr.push(handler as EventHandler)
        broadcastHandlers.set(filter.event, arr)
      }
      return channel
    },

    subscribe(handler: StatusHandler): LocalChannel {
      // Immediately report as connected
      setTimeout(() => handler('SUBSCRIBED'), 0)
      return channel
    },

    track(data: Record<string, unknown>) {
      const d = data as { playerId: string; name: string; status: string }
      trackedData = d
      const state = readPresence(roomCode)
      state[d.playerId] = [d]
      writePresence(roomCode, state)
      bc.postMessage({ _type: 'presence_update' })
      fireSyncHandlers()
    },

    send(msg: { type: string; event: string; payload: unknown }) {
      if (msg.type !== 'broadcast') return
      // Don't echo to self (self: false semantics)
      bc.postMessage({ _type: 'broadcast', event: msg.event, payload: msg.payload })
    },

    presenceState() {
      return readPresence(roomCode)
    },

    unsubscribe() {
      // Remove this player's presence entry
      if (trackedData) {
        const state = readPresence(roomCode)
        delete state[trackedData.playerId]
        writePresence(roomCode, state)
        bc.postMessage({ _type: 'presence_update' })
      }
      window.removeEventListener('storage', onStorage)
      bc.close()
    },
  }

  return channel
}
