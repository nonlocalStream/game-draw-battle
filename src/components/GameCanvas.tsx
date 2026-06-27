import { useRef, useEffect, useCallback, useState } from 'react'
import type { GameState, PlayerState, Projectile, WeaponData } from '../types'
import { useGameLoop } from '../hooks/useGameLoop'
import { useKeyboard } from '../hooks/useKeyboard'
import { useMultiplayer } from '../hooks/useMultiplayer'
import { tickEngine, applyMeleeHit, calcMeleeDamage, getScreenShake } from '../game/engine'
import { movePlayer, fireAttack } from '../game/player'
import { takeDamage } from '../game/player'
import { renderFrame, addSwingEffect, addImpactEffect } from '../game/renderer'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/terrain'
import { createItemsForRoom, createItem } from '../game/items'
import { loadAssets } from '../game/sprites'

interface Props {
  initialState: GameState
  roomCode: string
  isSolo: boolean
  myWeapon: WeaponData | null
  onGameOver: (winner: string) => void
}

function cpuTick(cpu: PlayerState, target: PlayerState, dt: number): { player: PlayerState; projectile: Projectile | null } {
  const dx = target.x - cpu.x
  const dy = target.y - cpu.y
  const dist = Math.hypot(dx, dy)
  const desiredRange = cpu.isMelee ? 44 : 200

  let moveX = 0, moveY = 0
  if (dist > desiredRange + 20) { moveX = dx / dist; moveY = dy / dist }
  else if (dist < desiredRange - 20) { moveX = -dx / dist; moveY = -dy / dist }

  const speed = 2 * (60 / 1000) * dt
  const nx = Math.max(32, Math.min(CANVAS_WIDTH - 32, cpu.x + moveX * speed))
  const ny = Math.max(32, Math.min(CANVAS_HEIGHT - 32, cpu.y + moveY * speed))
  const isMoving = Math.abs(moveX) + Math.abs(moveY) > 0.01

  let facing = cpu.facing
  if (Math.abs(dx) > Math.abs(dy)) facing = dx > 0 ? 'right' : 'left'
  else facing = dy > 0 ? 'down' : 'up'

  const updated: PlayerState = {
    ...cpu, x: nx, y: ny, facing, isMoving,
    attackCooldown: Math.max(0, cpu.attackCooldown - dt),
    hitFlash: Math.max(0, cpu.hitFlash - dt),
    slowTimer: Math.max(0, cpu.slowTimer - dt),
    isSlowed: cpu.slowTimer - dt > 0,
    isDefending: false,
  }

  if (dist < desiredRange + 60 && updated.attackCooldown <= 0 && Math.random() < 0.02) {
    const result = fireAttack(updated)
    return { player: result.player, projectile: result.projectile }
  }
  return { player: updated, projectile: null }
}

export function GameCanvas({ initialState, roomCode, isSolo, myWeapon, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState>(initialState)
  const keyboardRef = useKeyboard(1)
  const prevAttack = useRef(false)
  const broadcastIntervalRef = useRef(0)
  const gameTimeRef = useRef(0)
  const prevLocalHp = useRef(initialState.localPlayer.hp)
  const prevRemoteHp = useRef(initialState.remotePlayer?.hp ?? 0)
  const prevRemoteCooldown = useRef(0)
  const [, forceUpdate] = useState(0)

  useEffect(() => { loadAssets() }, [])

  const myWeaponRef = useRef(myWeapon)
  useEffect(() => { myWeaponRef.current = myWeapon }, [myWeapon])

  // Seed items from room code so both clients place them identically
  useEffect(() => {
    const items = isSolo
      ? [createItem('PowerShard'), createItem('SpeedBoost'), createItem('ShieldRune')]
      : createItemsForRoom(roomCode)
    stateRef.current = { ...stateRef.current, items }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Remote event handlers ──

  const handleRemoteState = useCallback((remoteState: PlayerState) => {
    const prev = stateRef.current.remotePlayer
    if (prev && remoteState.attackCooldown > prevRemoteCooldown.current + 100) {
      if (remoteState.isMelee) {
        addSwingEffect(remoteState.x, remoteState.y, remoteState.facing, remoteState.drawingDataUrl)
      }
    }
    prevRemoteCooldown.current = remoteState.attackCooldown
    stateRef.current = { ...stateRef.current, remotePlayer: remoteState }
  }, [])

  const handleRemoteProjectile = useCallback((proj: Projectile) => {
    stateRef.current = {
      ...stateRef.current,
      projectiles: [...stateRef.current.projectiles, proj]
    }
  }, [])

  // Remote player hit us with melee — apply damage to ourselves and immediately broadcast
  const handleRemoteMeleeHit = useCallback((damage: number) => {
    if (damage <= 0) return
    const damaged = takeDamage(stateRef.current.localPlayer, damage)
    addImpactEffect(damaged.x, damaged.y)
    stateRef.current = { ...stateRef.current, localPlayer: damaged }
    // Immediate broadcast so attacker sees hp drop without waiting for next interval
    broadcastStateRef.current(damaged)
  }, [])

  const handleRemoteItemCollected = useCallback((itemId: string) => {
    stateRef.current = {
      ...stateRef.current,
      items: stateRef.current.items.filter(i => i.id !== itemId)
    }
  }, [])

  // Use a ref for broadcastState so handleRemoteMeleeHit can call it without circular dep
  const broadcastStateRef = useRef<(s: PlayerState) => void>(() => {})

  const { broadcastState, broadcastProjectile, broadcastMeleeHit, broadcastItemCollected } = useMultiplayer(
    roomCode, initialState.localPlayer.id,
    handleRemoteState, handleRemoteProjectile,
    handleRemoteMeleeHit, handleRemoteItemCollected,
    () => {},
    !isSolo && !!roomCode
  )

  useEffect(() => { broadcastStateRef.current = broadcastState }, [broadcastState])

  const tick = useCallback((dt: number) => {
    const input = keyboardRef.current
    let state = stateRef.current
    gameTimeRef.current += dt

    // Move local player
    let localPlayer = movePlayer(state.localPlayer, input, dt)

    // Attack (on press, not hold)
    if (input.attack && !prevAttack.current) {
      const result = fireAttack(localPlayer)

      if (result.meleeHit) {
        addSwingEffect(localPlayer.x, localPlayer.y, localPlayer.facing, localPlayer.drawingDataUrl)

        if (isSolo && state.remotePlayer) {
          const prevHp = state.remotePlayer.hp
          const damaged = applyMeleeHit(localPlayer, state.remotePlayer, result.meleeHit)
          if (damaged.hp < prevHp) addImpactEffect(state.remotePlayer.x, state.remotePlayer.y)
          state = { ...state, remotePlayer: damaged }
        } else if (!isSolo && state.remotePlayer) {
          // Multiplayer: broadcast damage amount; remote applies to themselves
          const dmg = calcMeleeDamage(localPlayer, state.remotePlayer.element, result.meleeHit, state.remotePlayer)
          if (dmg > 0) broadcastMeleeHit(dmg)
        }
      }

      if (result.projectile) {
        state = { ...state, projectiles: [...state.projectiles, result.projectile] }
        if (!isSolo) broadcastProjectile(result.projectile)
      }

      localPlayer = result.player
    }
    prevAttack.current = input.attack
    state = { ...state, localPlayer }

    // CPU AI (solo only)
    if (isSolo && state.remotePlayer) {
      const cpuResult = cpuTick(state.remotePlayer, state.localPlayer, dt)
      let remotePlayer = cpuResult.player
      if (cpuResult.projectile) {
        state = { ...state, projectiles: [...state.projectiles, cpuResult.projectile] }
      }
      if (remotePlayer.isMelee && remotePlayer.attackCooldown <= 0) {
        const dist = Math.hypot(remotePlayer.x - state.localPlayer.x, remotePlayer.y - state.localPlayer.y)
        if (dist < 54 && Math.random() < 0.015) {
          const dirs: Record<string, [number, number]> = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }
          const [ddx, ddy] = dirs[remotePlayer.facing]
          const hit = { x: remotePlayer.x + ddx * 36, y: remotePlayer.y + ddy * 36, range: 28 }
          addSwingEffect(remotePlayer.x, remotePlayer.y, remotePlayer.facing, remotePlayer.drawingDataUrl)
          const prevHp = state.localPlayer.hp
          const hitLocal = applyMeleeHit(remotePlayer, state.localPlayer, hit)
          if (hitLocal.hp < prevHp) addImpactEffect(state.localPlayer.x, state.localPlayer.y)
          state = { ...state, localPlayer: hitLocal }
          remotePlayer = { ...remotePlayer, attackCooldown: 600 }
        }
      }
      state = { ...state, remotePlayer }
    }

    // Track item counts before engine tick
    const prevItemIds = new Set(state.items.map(i => i.id))
    const prevLHp = prevLocalHp.current
    const prevRHp = prevRemoteHp.current
    const prevAttackLevel = state.localPlayer.attackLevel

    state = tickEngine(state, dt, isSolo)

    // Detect hp drops from projectile hits
    if (state.localPlayer.hp < prevLHp) addImpactEffect(state.localPlayer.x, state.localPlayer.y)
    if (state.remotePlayer && state.remotePlayer.hp < prevRHp) addImpactEffect(state.remotePlayer.x, state.remotePlayer.y)
    prevLocalHp.current = state.localPlayer.hp
    prevRemoteHp.current = state.remotePlayer?.hp ?? 0

    // Broadcast items picked up by local player
    if (!isSolo) {
      for (const id of prevItemIds) {
        if (!state.items.some(i => i.id === id)) {
          broadcastItemCollected(id)
        }
      }
    }

    // Apply weapon upgrade name on PowerShard pickup
    if (state.localPlayer.attackLevel > prevAttackLevel && myWeaponRef.current?.upgrade) {
      state = {
        ...state,
        localPlayer: { ...state.localPlayer, weaponName: myWeaponRef.current.upgrade.weaponName }
      }
    }

    stateRef.current = state

    broadcastIntervalRef.current += dt
    if (broadcastIntervalRef.current >= 50) {
      broadcastIntervalRef.current = 0
      broadcastState(state.localPlayer)
    }

    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')!
      const remoteId = state.remotePlayer?.id ?? 'zzz'
      const localIsFirst = isSolo || state.localPlayer.id < remoteId
      renderFrame(
        ctx, state.localPlayer, state.remotePlayer,
        state.projectiles, state.items,
        gameTimeRef.current, dt, getScreenShake(),
        localIsFirst ? 0 : 1,
        localIsFirst ? 1 : 0,
      )
    }

    if (state.winner) onGameOver(state.winner)
    forceUpdate(n => n + 1)
  }, [keyboardRef, isSolo, broadcastState, broadcastProjectile, broadcastMeleeHit, broadcastItemCollected, onGameOver])

  useGameLoop(tick, !stateRef.current.winner)

  const local = stateRef.current.localPlayer
  const remote = stateRef.current.remotePlayer

  return (
    <div className="game-canvas-wrap">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="game-canvas" />

      <div className="game-hud">
        <div className="hud-player local">
          <div className="hud-label">{local.name}</div>
          <div className="hud-weapon">{local.weaponName}{local.attackLevel > 0 ? ' ★' : ''}</div>
          <div className="hud-hp-bar">
            <div className="hud-hp-fill" style={{ width: `${(local.hp / local.maxHp) * 100}%`, background: '#5cb85c' }} />
          </div>
          <span className="hud-hp-text">{Math.ceil(local.hp)}/{local.maxHp}</span>
        </div>

        <div className="hud-vs">VS</div>

        {remote && (
          <div className="hud-player remote">
            <div className="hud-label">{remote.name}</div>
            <div className="hud-weapon">{remote.weaponName}</div>
            <div className="hud-hp-bar">
              <div className="hud-hp-fill" style={{ width: `${(remote.hp / remote.maxHp) * 100}%`, background: '#d9534f' }} />
            </div>
            <span className="hud-hp-text">{Math.ceil(remote.hp)}/{remote.maxHp}</span>
          </div>
        )}
      </div>

      <div className="game-controls-hint">
        Arrow keys move · Space attack · Shift defend
      </div>
    </div>
  )
}
