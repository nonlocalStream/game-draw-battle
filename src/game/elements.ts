import type { Element, ElementStats } from '../types'

export const ELEMENT_STATS: Record<Element, ElementStats> = {
  Jin: {
    hp: 100, speed: 3, atkDmg: 25, defMult: 0.4,
    isMelee: true, projSpeed: 0,
    color: '#C0C0C0', glowColor: '#FFD700',
    emoji: '⚔️', label: 'Metal', chineseName: '金',
    description: 'Swift and deadly, like a blade that never dulls.'
  },
  Mu: {
    hp: 90, speed: 3.5, atkDmg: 15, defMult: 0.5,
    isMelee: false, projSpeed: 4,
    color: '#4CAF50', glowColor: '#8BC34A',
    emoji: '🏹', label: 'Wood', chineseName: '木',
    description: 'Patient as a growing tree, strikes from afar.'
  },
  Shui: {
    hp: 85, speed: 3.5, atkDmg: 12, defMult: 0.5,
    isMelee: false, projSpeed: 3,
    color: '#2196F3', glowColor: '#03A9F4',
    emoji: '💧', label: 'Water', chineseName: '水',
    description: 'Flows around obstacles, slowing all it touches.'
  },
  Huo: {
    hp: 75, speed: 4, atkDmg: 20, defMult: 0.6,
    isMelee: false, projSpeed: 5,
    color: '#FF5722', glowColor: '#FF9800',
    emoji: '🔥', label: 'Fire', chineseName: '火',
    description: 'Burns bright and fierce, but fragile as a flame.'
  },
  Tu: {
    hp: 130, speed: 2, atkDmg: 28, defMult: 0.3,
    isMelee: true, projSpeed: 0,
    color: '#795548', glowColor: '#A1887F',
    emoji: '🪨', label: 'Earth', chineseName: '土',
    description: 'Immovable as a mountain, unyielding as stone.'
  }
}

// Wu Xing cycle: key beats value
export const ELEMENT_BEATS: Record<Element, Element> = {
  Jin: 'Mu',
  Mu: 'Tu',
  Tu: 'Shui',
  Shui: 'Huo',
  Huo: 'Jin'
}

export function getElementAdvantage(attacker: Element, defender: Element): number {
  if (ELEMENT_BEATS[attacker] === defender) return 1.2
  if (ELEMENT_BEATS[defender] === attacker) return 0.85
  return 1.0
}

export const ELEMENT_COLORS: Record<Element, { bg: string; border: string; text: string }> = {
  Jin: { bg: '#FFF9E6', border: '#FFD700', text: '#8B6914' },
  Mu: { bg: '#F0FFF0', border: '#4CAF50', text: '#2E7D32' },
  Shui: { bg: '#E6F3FF', border: '#2196F3', text: '#0D47A1' },
  Huo: { bg: '#FFF3E0', border: '#FF5722', text: '#BF360C' },
  Tu: { bg: '#EFEBE9', border: '#795548', text: '#3E2723' }
}

export const ALL_ELEMENTS: Element[] = ['Jin', 'Mu', 'Shui', 'Huo', 'Tu']

export function randomElement(): Element {
  return ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)]
}
