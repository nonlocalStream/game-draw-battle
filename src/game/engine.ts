import type { GameState, Projectile, PlayerState, MapItem } from '../types'
import { getElementAdvantage, ELEMENT_STATS } from './elements'
import { collidesWithMap, CANVAS_WIDTH, CANVAS_HEIGHT } from './terrain'
import { takeDamage } from './player'
import { applyItem, createItem, tickItems } from './items'

const ITEM_SPAWN_INTERVAL = 15000
let itemSpawnTimer = 0
let screenShake = 0

export function getScreenShake(): number { return screenShake }

// isSolo=true: full authoritative sim (single screen handles everything)
// isSolo=false: multiplayer — skip damage/items on remotePlayer; each player handles own state
export function tickEngine(state: GameState, dt: number, isSolo = true): GameState {
  let { localPlayer, remotePlayer, projectiles, items } = state

  screenShake = Math.max(0, screenShake - dt * 0.01)

  // Only spawn items in solo (multiplayer uses seeded initial items)
  itemSpawnTimer += dt
  if (isSolo && itemSpawnTimer >= ITEM_SPAWN_INTERVAL && items.length < 5) {
    items = [...items, createItem()]
    itemSpawnTimer = 0
  }

  items = tickItems(items, dt)

  // Tick projectiles
  projectiles = projectiles
    .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, age: p.age + dt }))
    .filter(p => {
      if (p.age >= p.lifespan) return false
      if (p.x < 0 || p.x > CANVAS_WIDTH || p.y < 0 || p.y > CANVAS_HEIGHT) return false
      if (collidesWithMap(p.x, p.y, p.radius)) return false
      return true
    })

  // Projectile vs players
  const surviving: Projectile[] = []
  for (const proj of projectiles) {
    let hit = false

    // Always check hit on local player (we are authoritative over ourselves)
    if (proj.ownerId !== localPlayer.id && !localPlayer.dead) {
      const dist = Math.hypot(proj.x - localPlayer.x, proj.y - localPlayer.y)
      if (dist < proj.radius + 14) {
        const mult = getElementAdvantage(proj.element, localPlayer.element)
        localPlayer = takeDamage(localPlayer, proj.damage * mult)
        if (proj.slowEffect) localPlayer = { ...localPlayer, slowTimer: 2000, isSlowed: true }
        screenShake = 0.5
        hit = true
      }
    }

    // Only apply damage to remote in solo mode; in multiplayer remote handles their own HP
    if (!hit && remotePlayer && proj.ownerId !== remotePlayer.id && !remotePlayer.dead) {
      const dist = Math.hypot(proj.x - remotePlayer.x, proj.y - remotePlayer.y)
      if (dist < proj.radius + 14) {
        if (isSolo) {
          const mult = getElementAdvantage(proj.element, remotePlayer.element)
          remotePlayer = takeDamage(remotePlayer, proj.damage * mult)
          if (proj.slowEffect) remotePlayer = { ...remotePlayer, slowTimer: 2000, isSlowed: true }
          screenShake = 0.5
        }
        hit = true // consume projectile either way
      }
    }

    if (!hit) surviving.push(proj)
  }
  projectiles = surviving

  // Items pickup — in multiplayer, only local player picks up; remote handles themselves
  const remainingItems: MapItem[] = []
  for (const item of items) {
    let picked = false
    if (!localPlayer.dead && Math.hypot(item.x - localPlayer.x, item.y - localPlayer.y) < 22) {
      localPlayer = applyItem(localPlayer, item)
      picked = true
    } else if (isSolo && remotePlayer && !remotePlayer.dead && Math.hypot(item.x - remotePlayer.x, item.y - remotePlayer.y) < 22) {
      remotePlayer = applyItem(remotePlayer, item)
      picked = true
    }
    if (!picked) remainingItems.push(item)
  }

  // Winner detection
  let winner = state.winner
  if (!winner) {
    if (localPlayer.dead) winner = remotePlayer?.name ?? 'Opponent'
    else if (remotePlayer?.dead) winner = localPlayer.name
  }

  return { ...state, localPlayer, remotePlayer, projectiles, items: remainingItems, winner, tick: state.tick + 1 }
}

export function applyMeleeHit(
  attacker: PlayerState,
  target: PlayerState,
  hitPos: { x: number; y: number; range: number }
): PlayerState {
  const dist = Math.hypot(hitPos.x - target.x, hitPos.y - target.y)
  if (dist > hitPos.range + 14) return target
  const mult = getElementAdvantage(attacker.element, target.element)
  const stats = ELEMENT_STATS[attacker.element]
  const dmg = stats.atkDmg * (1 + attacker.attackLevel * 0.2) * mult
  screenShake = 0.6
  return takeDamage(target, dmg)
}

// Compute melee damage without applying it (for multiplayer broadcast)
export function calcMeleeDamage(
  attacker: PlayerState,
  targetElement: PlayerState['element'],
  hitPos: { x: number; y: number; range: number },
  targetPos: { x: number; y: number }
): number {
  const dist = Math.hypot(hitPos.x - targetPos.x, hitPos.y - targetPos.y)
  if (dist > hitPos.range + 14) return 0
  const mult = getElementAdvantage(attacker.element, targetElement)
  const stats = ELEMENT_STATS[attacker.element]
  return stats.atkDmg * (1 + attacker.attackLevel * 0.2) * mult
}
