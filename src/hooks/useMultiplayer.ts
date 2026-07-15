import { useEffect, useRef, useCallback } from 'react'
import { getRoomChannel, type GameChannel } from '../lib/supabase'
import type { PlayerState, Projectile, RemotePayload } from '../types'

interface MultiplayerHook {
  broadcastState: (state: PlayerState) => void
  broadcastProjectile: (proj: Projectile) => void
  broadcastMeleeHit: (damage: number, targetId: string) => void
  broadcastItemCollected: (itemId: string) => void
  broadcastReady: (weaponData: { element: string; weaponName: string; isMelee: boolean }) => void
  connected: boolean
}

export function useMultiplayer(
  roomCode: string,
  playerId: string,
  onRemoteState: (state: PlayerState) => void,
  onRemoteProjectile: (proj: Projectile) => void,
  onRemoteMeleeHit: (damage: number, targetId: string) => void,
  onRemoteItemCollected: (itemId: string) => void,
  onRemoteReady: (data: { element: string; weaponName: string; isMelee: boolean }) => void,
  enabled: boolean
): MultiplayerHook {
  const channelRef = useRef<GameChannel | null>(null)
  const connectedRef = useRef(false)

  useEffect(() => {
    if (!enabled || !roomCode) return

    const channel = getRoomChannel(roomCode, playerId)
    if (!channel) return

    channel
      .on('broadcast', { event: 'player_state' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteState(payload.data as PlayerState)
      })
      .on('broadcast', { event: 'projectile_fired' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) onRemoteProjectile(payload.data as Projectile)
      })
      .on('broadcast', { event: 'melee_hit' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) {
          const { damage, targetId } = payload.data as { damage: number; targetId: string }
          onRemoteMeleeHit(damage, targetId)
        }
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
    broadcastMeleeHit: useCallback((dmg, targetId) => send('melee_hit', { damage: dmg, targetId }), [send]),
    broadcastItemCollected: useCallback((id) => send('item_collected', id), [send]),
    broadcastReady: useCallback((w) => send('ready', w), [send]),
    connected: connectedRef.current,
  }
}
