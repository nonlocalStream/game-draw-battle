import type { PlayerState } from '../types'

// Character sheet: 8 cols × 3 rows on green (#00FF00) background
// Row 0 = Dog, Row 1 = Cat, Row 2 = Fox
// Cols: 0=front-idle1, 1=front-idle2, 2=front-walk,
//       3=turn, 4=side-idle, 5=side-walk, 6=back, 7=attack

// Props sheet: 4 cols × 1 row on green background
// Col 0=crystal, 1=full-jar, 2=cracked-jar, 3=shards

export interface SpriteSheet {
  canvas: HTMLCanvasElement
  frameW: number
  frameH: number
}

export interface GameAssets {
  background: HTMLImageElement
  characters: SpriteSheet
  props: SpriteSheet
}

let _assets: GameAssets | null = null
let _loading = false
let _listeners: Array<(a: GameAssets) => void> = []

function removeGreenScreen(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    if (g > 180 && r < 120 && b < 120) d[i + 3] = 0
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function loadAssets(): Promise<GameAssets> {
  if (_assets) return _assets
  if (_loading) return new Promise(r => _listeners.push(r))
  _loading = true

  const [bgImg, charImg, propsImg] = await Promise.all([
    loadImg('/assets/battleground-grass-courtyard-01.png'),
    loadImg('/assets/characters-action-sheet-01.png'),
    loadImg('/assets/props-upgrade-jars-01.png'),
  ])

  _assets = {
    background: bgImg,
    characters: {
      canvas: removeGreenScreen(charImg),
      frameW: Math.floor(charImg.naturalWidth / 8),
      frameH: Math.floor(charImg.naturalHeight / 3),
    },
    props: {
      canvas: removeGreenScreen(propsImg),
      frameW: Math.floor(propsImg.naturalWidth / 4),
      frameH: propsImg.naturalHeight,
    },
  }

  _listeners.forEach(fn => fn(_assets!))
  _listeners = []
  return _assets
}

export function getAssets(): GameAssets | null { return _assets }

interface FrameResult { col: number; row: number; flipX: boolean }

// time = elapsed ms (use for frame cycling so it's fps-independent)
// spriteRow: 0 = dog, 1 = cat, 2 = fox
export function getCharFrame(player: PlayerState, time: number, spriteRow: number): FrameResult {
  const row = spriteRow
  const attacking = player.attackCooldown > (player.isMelee ? 320 : 650)

  if (attacking) return { col: 7, row, flipX: false }

  const { facing, isMoving } = player

  if (facing === 'up') return { col: 6, row, flipX: false }

  if (facing === 'left') {
    // Alternate cols 4 ↔ 5 every 200ms while moving
    const col = isMoving ? (Math.floor(time / 200) % 2 === 0 ? 4 : 5) : 4
    return { col, row, flipX: true }
  }
  if (facing === 'right') {
    const col = isMoving ? (Math.floor(time / 200) % 2 === 0 ? 4 : 5) : 4
    return { col, row, flipX: false }
  }

  // Facing down: idle bob (0↔1) or walk (0↔2)
  if (!isMoving) {
    const col = Math.floor(time / 600) % 2 === 0 ? 0 : 1
    return { col, row, flipX: false }
  }
  const col = Math.floor(time / 180) % 2 === 0 ? 0 : 2
  return { col, row, flipX: false }
}

export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  col: number, row: number,
  destX: number, destY: number,
  destW: number, destH: number,
  flipX = false
): void {
  ctx.save()
  if (flipX) {
    ctx.translate(destX + destW / 2, 0)
    ctx.scale(-1, 1)
    ctx.translate(-(destX + destW / 2), 0)
  }
  ctx.drawImage(
    sheet.canvas,
    col * sheet.frameW, row * sheet.frameH,
    sheet.frameW, sheet.frameH,
    destX, destY, destW, destH
  )
  ctx.restore()
}
