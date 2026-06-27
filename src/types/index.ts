export type Element = 'Jin' | 'Mu' | 'Shui' | 'Huo' | 'Tu'
export type Facing = 'up' | 'down' | 'left' | 'right'
export type GamePhase = 'menu' | 'lobby' | 'drawing' | 'recognition' | 'waiting' | 'battle' | 'gameover'
export type ItemType = 'PowerShard' | 'SpeedBoost' | 'ShieldRune'
export type TileType = 'grass' | 'water' | 'stone' | 'flower' | 'sand'

export interface WeaponUpgrade {
  weaponName: string
  description: string
}

export interface WeaponData {
  element: Element
  weaponName: string
  isMelee: boolean
  description: string
  drawingDataUrl: string
  upgrade?: WeaponUpgrade   // pre-generated lv2 data, populated async
}

export interface SavedWeapon extends WeaponData {
  id: string
  savedAt: number
}

export interface ElementStats {
  hp: number
  speed: number
  atkDmg: number
  defMult: number
  isMelee: boolean
  projSpeed: number
  color: string
  glowColor: string
  emoji: string
  label: string
  chineseName: string
  description: string
}

export interface Projectile {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  element: Element
  damage: number
  ownerId: string
  radius: number
  lifespan: number
  age: number
  slowEffect: boolean
  drawingDataUrl?: string
}

export interface MapItem {
  id: string
  x: number
  y: number
  type: ItemType
  pulse: number
}

export interface PlayerState {
  id: string
  name: string
  x: number
  y: number
  hp: number
  maxHp: number
  element: Element
  weaponName: string
  isMelee: boolean
  attackLevel: number
  speedBoostTimer: number
  shieldTimer: number
  facing: Facing
  isAttacking: boolean
  isDefending: boolean
  attackCooldown: number
  hitFlash: number
  isSlowed: boolean
  slowTimer: number
  drawingDataUrl: string
  dead: boolean
  isMoving: boolean
}

export interface GameState {
  localPlayer: PlayerState
  remotePlayer: PlayerState | null
  projectiles: Projectile[]
  items: MapItem[]
  phase: GamePhase
  winner: string | null
  tick: number
}

export interface RemotePayload {
  type: 'player_state' | 'projectile_fired' | 'item_collected' | 'game_over' | 'ready'
  playerId: string
  data: unknown
}
