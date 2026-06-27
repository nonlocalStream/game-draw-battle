import type { PlayerState, Facing, Element, Projectile } from '../types'
import { ELEMENT_STATS } from './elements'
import { collidesWithMap, TILE_SIZE, MAP_COLS, MAP_ROWS } from './terrain'

let projCounter = 0

export function createPlayer(id: string, name: string, element: Element, weaponName: string, isMelee: boolean, drawingDataUrl: string, startX: number, startY: number): PlayerState {
  const stats = ELEMENT_STATS[element]
  return {
    id, name, element, weaponName, isMelee: stats.isMelee || isMelee,
    x: startX, y: startY,
    hp: stats.hp, maxHp: stats.hp,
    attackLevel: 0,
    speedBoostTimer: 0, shieldTimer: 0,
    facing: 'down',
    isAttacking: false, isDefending: false,
    attackCooldown: 0, hitFlash: 0,
    isSlowed: false, slowTimer: 0,
    isMoving: false,
    drawingDataUrl, dead: false
  }
}

export interface InputState {
  up: boolean; down: boolean; left: boolean; right: boolean
  attack: boolean; defend: boolean
}

export function movePlayer(player: PlayerState, input: InputState, dt: number): PlayerState {
  const stats = ELEMENT_STATS[player.element]
  let speed = stats.speed * (60 / 1000) * dt
  if (player.speedBoostTimer > 0) speed *= 1.6
  if (player.isSlowed) speed *= 0.5

  let dx = 0, dy = 0
  if (input.up) dy -= 1
  if (input.down) dy += 1
  if (input.left) dx -= 1
  if (input.right) dx += 1

  const wantsMove = dx !== 0 || dy !== 0
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707 }

  let newX = player.x + dx * speed
  let newY = player.y + dy * speed

  newX = Math.max(TILE_SIZE, Math.min(MAP_COLS * TILE_SIZE - TILE_SIZE, newX))
  newY = Math.max(TILE_SIZE, Math.min(MAP_ROWS * TILE_SIZE - TILE_SIZE, newY))

  if (collidesWithMap(newX, player.y)) newX = player.x
  if (collidesWithMap(player.x, newY)) newY = player.y
  if (collidesWithMap(newX, newY)) { newX = player.x; newY = player.y }

  const isMoving = wantsMove && (newX !== player.x || newY !== player.y)

  let facing: Facing = player.facing
  if (Math.abs(dx) > Math.abs(dy)) {
    facing = dx > 0 ? 'right' : 'left'
  } else if (dy !== 0) {
    facing = dy > 0 ? 'down' : 'up'
  }

  return {
    ...player, x: newX, y: newY, facing, isMoving,
    speedBoostTimer: Math.max(0, player.speedBoostTimer - dt),
    shieldTimer: Math.max(0, player.shieldTimer - dt),
    slowTimer: Math.max(0, player.slowTimer - dt),
    isSlowed: player.slowTimer - dt > 0,
    hitFlash: Math.max(0, player.hitFlash - dt),
    attackCooldown: Math.max(0, player.attackCooldown - dt),
    isDefending: input.defend
  }
}

export function fireAttack(player: PlayerState): {
  player: PlayerState
  projectile: Projectile | null
  meleeHit: { x: number; y: number; range: number } | null
} {
  if (player.attackCooldown > 0) return { player, projectile: null, meleeHit: null }

  const stats = ELEMENT_STATS[player.element]
  const damage = stats.atkDmg * (1 + player.attackLevel * 0.2)
  const cooldown = player.isMelee ? 500 : 900

  const dirMap: Record<Facing, [number, number]> = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]
  }
  const [dx, dy] = dirMap[player.facing]
  const updatedPlayer = { ...player, attackCooldown: cooldown, isAttacking: true }

  if (player.isMelee) {
    return {
      player: updatedPlayer,
      projectile: null,
      meleeHit: { x: player.x + dx * 40, y: player.y + dy * 40, range: 32 }
    }
  } else {
    const proj: Projectile = {
      id: `proj_${projCounter++}`,
      x: player.x + dx * 22,
      y: player.y + dy * 22,
      vx: dx * stats.projSpeed,
      vy: dy * stats.projSpeed,
      element: player.element,
      damage,
      ownerId: player.id,
      radius: 10,
      lifespan: 2500,
      age: 0,
      slowEffect: player.element === 'Shui',
      drawingDataUrl: player.drawingDataUrl,
    }
    return { player: updatedPlayer, projectile: proj, meleeHit: null }
  }
}

export function takeDamage(player: PlayerState, damage: number): PlayerState {
  const effective = player.isDefending ? damage * ELEMENT_STATS[player.element].defMult
    : player.shieldTimer > 0 ? damage * 0.2
    : damage
  const hp = Math.max(0, player.hp - effective)
  return { ...player, hp, hitFlash: 300, dead: hp <= 0 }
}
