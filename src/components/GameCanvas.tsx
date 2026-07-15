import { useRef, useEffect, useCallback, useState } from 'react'
import type { GameState, PlayerState, Projectile, WeaponData } from '../types'
import { useGameLoop } from '../hooks/useGameLoop'
import { useKeyboard } from '../hooks/useKeyboard'
import { useMultiplayer } from '../hooks/useMultiplayer'
import { MobileControls } from './MobileControls'

const isMobileDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
import { tickEngine, applyMeleeHit, calcMeleeDamage, getScreenShake } from '../game/engine'
import { movePlayer, fireAttack, takeDamage } from '../game/player'
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

  const isMobile = isMobileDevice()
  const [isPortrait, setIsPortrait] = useState(
    () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  )
  useEffect(() => {
    if (!isMobile) return
    const update = () => setIsPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [isMobile])
  const prevAttack = useRef(false)
  const broadcastIntervalRef = useRef(0)
  const gameTimeRef = useRef(0)
  const prevLocalHp = useRef(initialState.localPlayer.hp)
  // Track previous HP per remote player for impact effects
  const prevRemoteHpRef = useRef<Map<string, number>>(
    new Map(initialState.remotePlayers.map(p => [p.id, p.hp]))
  )
  const prevRemoteCooldownRef = useRef<Map<string, number>>(new Map())
  const [, forceUpdate] = useState(0)

  useEffect(() => { loadAssets() }, [])

  const myWeaponRef = useRef(myWeapon)
  useEffect(() => { myWeaponRef.current = myWeapon }, [myWeapon])

  useEffect(() => {
    const items = isSolo
      ? [createItem('PowerShard'), createItem('SpeedBoost'), createItem('ShieldRune')]
      : createItemsForRoom(roomCode)
    stateRef.current = { ...stateRef.current, items }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Remote event handlers ──

  const handleRemoteState = useCallback((remoteState: PlayerState) => {
    const prevCooldown = prevRemoteCooldownRef.current.get(remoteState.id) ?? 0
    if (remoteState.attackCooldown > prevCooldown + 100 && remoteState.isMelee) {
      addSwingEffect(remoteState.x, remoteState.y, remoteState.facing, remoteState.drawingDataUrl)
    }
    prevRemoteCooldownRef.current.set(remoteState.id, remoteState.attackCooldown)

    const existing = stateRef.current.remotePlayers
    const idx = existing.findIndex(p => p.id === remoteState.id)
    const remotePlayers = idx >= 0
      ? existing.map((p, i) => i === idx ? remoteState : p)
      : [...existing, remoteState]
    stateRef.current = { ...stateRef.current, remotePlayers }
  }, [])

  const handleRemoteProjectile = useCallback((proj: Projectile) => {
    stateRef.current = {
      ...stateRef.current,
      projectiles: [...stateRef.current.projectiles, proj]
    }
  }, [])

  // Only apply melee damage if we are the intended target
  const handleRemoteMeleeHit = useCallback((damage: number, targetId: string) => {
    if (targetId !== stateRef.current.localPlayer.id || damage <= 0) return
    const damaged = takeDamage(stateRef.current.localPlayer, damage)
    addImpactEffect(damaged.x, damaged.y)
    stateRef.current = { ...stateRef.current, localPlayer: damaged }
    broadcastStateRef.current(damaged)
  }, [])

  const handleRemoteItemCollected = useCallback((itemId: string) => {
    stateRef.current = {
      ...stateRef.current,
      items: stateRef.current.items.filter(i => i.id !== itemId)
    }
  }, [])

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

    let localPlayer = movePlayer(state.localPlayer, input, dt)

    if (input.attack && !prevAttack.current) {
      const result = fireAttack(localPlayer)

      if (result.meleeHit) {
        addSwingEffect(localPlayer.x, localPlayer.y, localPlayer.facing, localPlayer.drawingDataUrl)

        if (isSolo && state.remotePlayers.length > 0) {
          const cpu = state.remotePlayers[0]
          const prevHp = cpu.hp
          const damaged = applyMeleeHit(localPlayer, cpu, result.meleeHit)
          if (damaged.hp < prevHp) addImpactEffect(cpu.x, cpu.y)
          state = { ...state, remotePlayers: [damaged, ...state.remotePlayers.slice(1)] }
        } else if (!isSolo) {
          for (const rp of state.remotePlayers) {
            if (rp.dead) continue
            const dmg = calcMeleeDamage(localPlayer, rp.element, result.meleeHit, rp)
            if (dmg > 0) broadcastMeleeHit(dmg, rp.id)
          }
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

    // CPU AI (solo only — targets first remote player)
    if (isSolo && state.remotePlayers.length > 0) {
      const cpuResult = cpuTick(state.remotePlayers[0], state.localPlayer, dt)
      let cpu = cpuResult.player
      if (cpuResult.projectile) {
        state = { ...state, projectiles: [...state.projectiles, cpuResult.projectile] }
      }
      if (cpu.isMelee && cpu.attackCooldown <= 0) {
        const dist = Math.hypot(cpu.x - state.localPlayer.x, cpu.y - state.localPlayer.y)
        if (dist < 54 && Math.random() < 0.015) {
          const dirs: Record<string, [number, number]> = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }
          const [ddx, ddy] = dirs[cpu.facing]
          const hit = { x: cpu.x + ddx * 36, y: cpu.y + ddy * 36, range: 28 }
          addSwingEffect(cpu.x, cpu.y, cpu.facing, cpu.drawingDataUrl)
          const prevHp = state.localPlayer.hp
          const hitLocal = applyMeleeHit(cpu, state.localPlayer, hit)
          if (hitLocal.hp < prevHp) addImpactEffect(state.localPlayer.x, state.localPlayer.y)
          state = { ...state, localPlayer: hitLocal }
          cpu = { ...cpu, attackCooldown: 600 }
        }
      }
      state = { ...state, remotePlayers: [cpu, ...state.remotePlayers.slice(1)] }
    }

    const prevItemIds = new Set(state.items.map(i => i.id))
    const prevLHp = prevLocalHp.current
    const prevAttackLevel = state.localPlayer.attackLevel

    state = tickEngine(state, dt, isSolo)

    // Impact effects
    if (state.localPlayer.hp < prevLHp) addImpactEffect(state.localPlayer.x, state.localPlayer.y)
    for (const rp of state.remotePlayers) {
      const prevHp = prevRemoteHpRef.current.get(rp.id) ?? rp.hp
      if (rp.hp < prevHp) addImpactEffect(rp.x, rp.y)
      prevRemoteHpRef.current.set(rp.id, rp.hp)
    }
    prevLocalHp.current = state.localPlayer.hp

    if (!isSolo) {
      for (const id of prevItemIds) {
        if (!state.items.some(i => i.id === id)) broadcastItemCollected(id)
      }
    }

    if (state.localPlayer.attackLevel > prevAttackLevel && myWeaponRef.current?.upgrade) {
      state = {
        ...state,
        localPlayer: { ...state.localPlayer, weaponName: myWeaponRef.current.upgrade.weaponName }
      }
    }

    stateRef.current = state

    // Throttled broadcast: 100ms (10fps) — keeps well under Supabase free tier for 6 players
    broadcastIntervalRef.current += dt
    if (broadcastIntervalRef.current >= 100) {
      broadcastIntervalRef.current = 0
      broadcastState(state.localPlayer)
    }

    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')!
      renderFrame(ctx, state.localPlayer, state.remotePlayers, state.projectiles, state.items, gameTimeRef.current, dt, getScreenShake())
    }

    if (state.winner) onGameOver(state.winner)
    forceUpdate(n => n + 1)
  }, [keyboardRef, isSolo, broadcastState, broadcastProjectile, broadcastMeleeHit, broadcastItemCollected, onGameOver])

  useGameLoop(tick, !stateRef.current.winner)

  const local = stateRef.current.localPlayer
  const remotePlayers = stateRef.current.remotePlayers

  return (
    <div className="game-canvas-wrap">
      {isMobile && isPortrait && (
        <div className="rotate-overlay">
          <div className="rotate-icon">📱</div>
          <p className="rotate-text">Rotate to landscape<br />to play</p>
        </div>
      )}

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

        <div className="hud-vs">{remotePlayers.length > 1 ? `VS ${remotePlayers.length}` : 'VS'}</div>

        {remotePlayers.slice(0, 5).map(rp => (
          <div key={rp.id} className="hud-player remote" style={{ opacity: rp.dead ? 0.4 : 1 }}>
            <div className="hud-label">{rp.name}{rp.dead ? ' 💀' : ''}</div>
            <div className="hud-weapon">{rp.weaponName}</div>
            <div className="hud-hp-bar">
              <div className="hud-hp-fill" style={{ width: `${(rp.hp / rp.maxHp) * 100}%`, background: '#d9534f' }} />
            </div>
            <span className="hud-hp-text">{Math.ceil(Math.max(0, rp.hp))}/{rp.maxHp}</span>
          </div>
        ))}
      </div>

      {isMobile && !isPortrait
        ? <MobileControls inputRef={keyboardRef} />
        : <div className="game-controls-hint">Arrow keys · Space attack · Shift defend</div>
      }
    </div>
  )
}
