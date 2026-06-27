import { useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRoomChannel } from '../lib/supabase'
import type { PlayerState, Projectile, RemotePayload } from '../types'

interface MultiplayerHook {
  broadcastState: (state: PlayerState) => void
  broadcastProjectile: (proj: Projectile) => void
  broadcastReady: (weaponData: { element: string; weaponName: string; isMelee: boolean }) => void
  connected: boolean
}

export function useMultiplayer(
  roomCode: string,
  playerId: string,
  onRemoteState: (state: PlayerState) => void,
  onRemoteProjectile: (proj: Projectile) => void,
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
        if (payload.playerId !== playerId) {
          onRemoteState(payload.data as PlayerState)
        }
      })
      .on('broadcast', { event: 'projectile_fired' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) {
          onRemoteProjectile(payload.data as Projectile)
        }
      })
      .on('broadcast', { event: 'ready' }, ({ payload }: { payload: RemotePayload }) => {
        if (payload.playerId !== playerId) {
          onRemoteReady(payload.data as { element: string; weaponName: string; isMelee: boolean })
        }
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

  const broadcastState = useCallback((state: PlayerState) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_state',
      payload: { type: 'player_state', playerId, data: state }
    })
  }, [playerId])

  const broadcastProjectile = useCallback((proj: Projectile) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'projectile_fired',
      payload: { type: 'projectile_fired', playerId, data: proj }
    })
  }, [playerId])

  const broadcastReady = useCallback((weaponData: { element: string; weaponName: string; isMelee: boolean }) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'ready',
      payload: { type: 'ready', playerId, data: weaponData }
    })
  }, [playerId])

  return { broadcastState, broadcastProjectile, broadcastReady, connected: connectedRef.current }
}
