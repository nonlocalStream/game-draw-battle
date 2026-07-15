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
// isSolo=false: multiplayer — skip damage/items on remotePlayers; each player handles own state
export function tickEngine(state: GameState, dt: number, isSolo = true): GameState {
  let { localPlayer, projectiles, items } = state
  let remotePlayers = state.remotePlayers

  screenShake = Math.max(0, screenShake - dt * 0.01)

  itemSpawnTimer += dt
  if (isSolo && itemSpawnTimer >= ITEM_SPAWN_INTERVAL && items.length < 5) {
    items = [...items, createItem()]
    itemSpawnTimer = 0
  }

  items = tickItems(items, dt)

  projectiles = projectiles
    .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, age: p.age + dt }))
    .filter(p => {
      if (p.age >= p.lifespan) return false
      if (p.x < 0 || p.x > CANVAS_WIDTH || p.y < 0 || p.y > CANVAS_HEIGHT) return false
      if (collidesWithMap(p.x, p.y, p.radius)) return false
      return true
    })

  const surviving: Projectile[] = []
  for (const proj of projectiles) {
    let hit = false

    // Local player is always authoritative over their own HP
    if (!hit && proj.ownerId !== localPlayer.id && !localPlayer.dead) {
      const dist = Math.hypot(proj.x - localPlayer.x, proj.y - localPlayer.y)
      if (dist < proj.radius + 14) {
        const mult = getElementAdvantage(proj.element, localPlayer.element)
        localPlayer = takeDamage(localPlayer, proj.damage * mult)
        if (proj.slowEffect) localPlayer = { ...localPlayer, slowTimer: 2000, isSlowed: true }
        screenShake = 0.5
        hit = true
      }
    }

    // In solo only: apply damage to remote players (we're authoritative for everyone)
    // In multiplayer: just consume the projectile so it doesn't pass through visually
    if (!hit && isSolo) {
      for (let i = 0; i < remotePlayers.length; i++) {
        const rp = remotePlayers[i]
        if (proj.ownerId === rp.id || rp.dead) continue
        const dist = Math.hypot(proj.x - rp.x, proj.y - rp.y)
        if (dist < proj.radius + 14) {
          const mult = getElementAdvantage(proj.element, rp.element)
          let damaged = takeDamage(rp, proj.damage * mult)
          if (proj.slowEffect) damaged = { ...damaged, slowTimer: 2000, isSlowed: true }
          remotePlayers = remotePlayers.map((p, j) => j === i ? damaged : p)
          screenShake = 0.5
          hit = true
          break
        }
      }
    } else if (!hit && !isSolo) {
      for (const rp of remotePlayers) {
        if (proj.ownerId === rp.id || rp.dead) continue
        const dist = Math.hypot(proj.x - rp.x, proj.y - rp.y)
        if (dist < proj.radius + 14) { hit = true; break }
      }
    }

    if (!hit) surviving.push(proj)
  }
  projectiles = surviving

  const remainingItems: MapItem[] = []
  for (const item of items) {
    let picked = false
    if (!localPlayer.dead && Math.hypot(item.x - localPlayer.x, item.y - localPlayer.y) < 22) {
      localPlayer = applyItem(localPlayer, item)
      picked = true
    } else if (isSolo) {
      for (let i = 0; i < remotePlayers.length; i++) {
        const rp = remotePlayers[i]
        if (!rp.dead && Math.hypot(item.x - rp.x, item.y - rp.y) < 22) {
          remotePlayers = remotePlayers.map((p, j) => j === i ? applyItem(p, item) : p)
          picked = true
          break
        }
      }
    }
    if (!picked) remainingItems.push(item)
  }

  // Last player alive wins
  let winner = state.winner
  if (!winner) {
    const alive = [
      ...(!localPlayer.dead ? [localPlayer] : []),
      ...remotePlayers.filter(p => !p.dead),
    ]
    if (alive.length <= 1) winner = alive[0]?.name ?? 'Draw'
  }

  return { ...state, localPlayer, remotePlayers, projectiles, items: remainingItems, winner, tick: state.tick + 1 }
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
