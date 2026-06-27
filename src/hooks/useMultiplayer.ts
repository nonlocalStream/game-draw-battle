import { useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRoomChannel } from '../lib/supabase'
import type { PlayerState, Projectile, RemotePayload } from '../types'

interface MultiplayerHook {
  broadcastState: (state: PlayerState) => void
  broadcastProjectile: (proj: Projectile) => void
  broadcastMeleeHit: (damage: number) => void
  broadcastItemCollected: (itemId: string) => void
  broadcastReady: (weaponData: { element: string; weaponName: string; isMelee: boolean }) => void
  connected: boolean
}

export function useMultiplayer(
  roomCode: string,
  playerId: string,
  onRemoteState: (state: PlayerState) => void,
  onRemoteProjectile: (proj: Projectile) => void,
  onRemoteMeleeHit: (damage: number) => void,
  onRemoteItemCollected: (itemId: string) => void,
  onRemoteReady: (data: { element: string; weaponName: string; isMelee: boolean }) => void,
  enabled: boolean
): MultiplayerHook {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const connectedRef = useRef(false)

  useEffect(() => {
    if (!enabled || !roomCode) return

    const channel = getRoomChannel(roomCode)
    if (!channel) return

    channel
      .on('broadcast', { event: 'player_state' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteState(payload.data as PlayerState)
      })
      .on('broadcast', { event: 'projectile_fired' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteProjectile(payload.data as Projectile)
      })
      .on('broadcast', { event: 'melee_hit' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteMeleeHit(payload.data as number)
      })
      .on('broadcast', { event: 'item_collected' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteItemCollected(payload.data as string)
      })
      .on('broadcast', { event: 'ready' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteReady(payload.data as { element: string; weaponName: string; isMelee: boolean })
      })
      .subscribe((status: string) => {
        connectedRef.current = status === 'SUBSCRIBED'
      })

    channelRef.current = channel
    return () => {
      channel.unsubscribe()
      channelRef.current = null
      connectedRef.current = false
    }
  }, [roomCode, playerId, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((event: string, data: unknown) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: { playerId, data } })
  }, [playerId])

  return {
    broadcastState: useCallback((s) => send('player_state', s), [send]),
    broadcastProjectile: useCallback((p) => send('projectile_fired', p), [send]),
    broadcastMeleeHit: useCallback((dmg) => send('melee_hit', dmg), [send]),
    broadcastItemCollected: useCallback((id) => send('item_collected', id), [send]),
    broadcastReady: useCallback((w) => send('ready', w), [send]),
    connected: connectedRef.current,
  }
}
