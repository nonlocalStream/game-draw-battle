import type { GameState, Projectile, PlayerState, MapItem } from '../types'
import { getElementAdvantage, ELEMENT_STATS } from './elements'
import { collidesWithMap, CANVAS_WIDTH, CANVAS_HEIGHT } from './terrain'
import { takeDamage } from './player'
import { applyItem, createItem, tickItems } from './items'

const ITEM_SPAWN_INTERVAL = 15000
let itemSpawnTimer = 0
let screenShake = 0

export function getScreenShake(): number { return screenShake }

export function tickEngine(state: GameState, dt: number): GameState {
  let { localPlayer, remotePlayer, projectiles, items } = state

  screenShake = Math.max(0, screenShake - dt * 0.01)
  itemSpawnTimer += dt
  if (itemSpawnTimer >= ITEM_SPAWN_INTERVAL && items.length < 5) {
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

    if (remotePlayer && proj.ownerId !== remotePlayer.id && !remotePlayer.dead && !hit) {
      const dist = Math.hypot(proj.x - remotePlayer.x, proj.y - remotePlayer.y)
      if (dist < proj.radius + 14) {
        const mult = getElementAdvantage(proj.element, remotePlayer.element)
        remotePlayer = takeDamage(remotePlayer, proj.damage * mult)
        if (proj.slowEffect) remotePlayer = { ...remotePlayer, slowTimer: 2000, isSlowed: true }
        screenShake = 0.5
        hit = true
      }
    }

    if (!hit) surviving.push(proj)
  }
  projectiles = surviving

  // Items pickup
  const remainingItems: MapItem[] = []
  for (const item of items) {
    let picked = false
    if (!localPlayer.dead && Math.hypot(item.x - localPlayer.x, item.y - localPlayer.y) < 22) {
      localPlayer = applyItem(localPlayer, item)
      picked = true
    } else if (remotePlayer && !remotePlayer.dead && Math.hypot(item.x - remotePlayer.x, item.y - remotePlayer.y) < 22) {
      remotePlayer = applyItem(remotePlayer, item)
      picked = true
    }
    if (!picked) remainingItems.push(item)
  }

  // Determine winner
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
