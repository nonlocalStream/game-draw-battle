import type { MapItem, ItemType, PlayerState } from '../types'
import { getRandomWalkableTile } from './terrain'

let itemIdCounter = 0

export function createItem(type?: ItemType): MapItem {
  const types: ItemType[] = ['PowerShard', 'SpeedBoost', 'ShieldRune']
  const t = type ?? types[Math.floor(Math.random() * types.length)]
  const pos = getRandomWalkableTile()
  return { id: `item_${itemIdCounter++}`, x: pos.x, y: pos.y, type: t, pulse: 0 }
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
