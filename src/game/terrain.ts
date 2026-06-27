import type { TileType } from '../types'

export const TILE_SIZE = 32
export const MAP_COLS = 20
export const MAP_ROWS = 15

// Map layout matching battleground-grass-courtyard concept:
// border=stone, inner grass, 4 stone clusters, pond top-right, flowers
// 0=grass, 1=water, 2=stone, 3=flower, 4=sand
const RAW_MAP: number[][] = [
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  [2,0,0,0,0,3,0,0,0,0,0,0,0,0,3,0,0,0,0,2],
  [2,0,4,4,0,0,0,0,0,0,0,0,0,0,0,0,4,4,0,2],
  [2,0,0,2,2,0,0,0,0,0,0,0,0,0,2,0,1,1,0,2],
  [2,0,0,2,0,0,0,3,0,0,0,3,0,0,2,2,1,1,0,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,2],
  [2,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,0,2,2,0,0,0,0,0,0,0,0,0,0,2,0,0,0,2],
  [2,0,0,0,2,0,0,3,0,0,0,3,0,0,2,2,0,0,0,2],
  [2,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,2],
  [2,0,4,4,0,0,0,0,0,0,0,0,0,0,0,0,4,4,0,2],
  [2,0,0,0,0,3,0,0,0,0,0,0,0,3,0,0,0,0,0,2],
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
]

const TILE_TYPES: TileType[] = ['grass', 'water', 'stone', 'flower', 'sand']
export const GAME_MAP: TileType[][] = RAW_MAP.map(row => row.map(v => TILE_TYPES[v]))

export function isWalkable(col: number, row: number): boolean {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
  const t = GAME_MAP[row][col]
  return t === 'grass' || t === 'flower' || t === 'sand'
}

export function isWalkablePixel(x: number, y: number): boolean {
  return isWalkable(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))
}

export function collidesWithMap(x: number, y: number, radius = 12): boolean {
  const offsets: [number, number][] = [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]
  return offsets.some(([dx, dy]) => !isWalkablePixel(x + dx, y + dy))
}

export function getRandomWalkableTile(): { x: number; y: number } {
  const walkable: { x: number; y: number }[] = []
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (isWalkable(c, r)) {
        walkable.push({ x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 })
      }
    }
  }
  return walkable[Math.floor(Math.random() * walkable.length)]
}

export const CANVAS_WIDTH = MAP_COLS * TILE_SIZE   // 640
export const CANVAS_HEIGHT = MAP_ROWS * TILE_SIZE  // 480
