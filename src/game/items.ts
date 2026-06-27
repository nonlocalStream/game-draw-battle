import type { MapItem, ItemType, PlayerState } from '../types'
import { getAllWalkableTiles } from './terrain'

// Simple seeded RNG (mulberry32) so both clients place items identically
function seedRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193)
  }
  return h >>> 0
}

export function createItemsForRoom(roomCode: string): MapItem[] {
  const rng = seedRng(hashStr(roomCode))
  const tiles = getAllWalkableTiles()
  const types: ItemType[] = ['PowerShard', 'SpeedBoost', 'ShieldRune']
  const used = new Set<number>()

  return types.map((type, i) => {
    let idx: number
    do { idx = Math.floor(rng() * tiles.length) } while (used.has(idx))
    used.add(idx)
    return { id: `item_${i}_${type}`, x: tiles[idx].x, y: tiles[idx].y, type, pulse: 0 }
  })
}

export function createItem(type?: ItemType): MapItem {
  const types: ItemType[] = ['PowerShard', 'SpeedBoost', 'ShieldRune']
  const t = type ?? types[Math.floor(Math.random() * types.length)]
  const tiles = getAllWalkableTiles()
  const pos = tiles[Math.floor(Math.random() * tiles.length)]
  return { id: `item_rnd_${Date.now()}`, x: pos.x, y: pos.y, type: t, pulse: 0 }
}

export function itemColor(type: ItemType): string {
  switch (type) {
    case 'PowerShard': return '#FF4081'
    case 'SpeedBoost': return '#00BCD4'
    case 'ShieldRune': return '#9C27B0'
  }
}

export function itemEmoji(type: ItemType): string {
  switch (type) {
    case 'PowerShard': return '⬆'
    case 'SpeedBoost': return '»'
    case 'ShieldRune': return '◈'
  }
}

export function applyItem(player: PlayerState, item: MapItem): PlayerState {
  const p = { ...player }
  switch (item.type) {
    case 'PowerShard':
      p.attackLevel = Math.min(p.attackLevel + 1, 3)
      break
    case 'SpeedBoost':
      p.speedBoostTimer = 5000
      break
    case 'ShieldRune':
      p.shieldTimer = 8000
      break
  }
  return p
}

export function tickItems(items: MapItem[], dt: number): MapItem[] {
  return items.map(item => ({ ...item, pulse: (item.pulse + dt * 0.003) % (Math.PI * 2) }))
}
