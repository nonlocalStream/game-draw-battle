import type { PlayerState, Projectile, MapItem, Facing } from '../types'
import { ELEMENT_STATS } from './elements'
import { CANVAS_WIDTH, CANVAS_HEIGHT, GAME_MAP, TILE_SIZE, MAP_ROWS, MAP_COLS } from './terrain'
import { getAssets, getCharFrame, drawSpriteFrame, PLAYER_SLOT_CONFIGS } from './sprites'

let _screenShake = 0
export function getScreenShake(): number { return _screenShake }
export function addScreenShake(v: number): void { _screenShake = Math.max(_screenShake, v) }

// ── Weapon image cache (drawing dataUrls → processed canvas) ──
// Removes near-white background so drawings composite cleanly in-game.
const weaponImgCache = new Map<string, HTMLCanvasElement | null>()

function removeWhiteBg(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2]
    if (r > 210 && g > 210 && b > 210) d[i+3] = 0
  }
  ctx.putImageData(data, 0, 0)
  return c
}

function getWeaponImage(dataUrl: string): HTMLCanvasElement | null {
  if (!dataUrl) return null
  if (weaponImgCache.has(dataUrl)) return weaponImgCache.get(dataUrl)!
  weaponImgCache.set(dataUrl, null) // mark loading
  const img = new Image()
  img.onload = () => weaponImgCache.set(dataUrl, removeWhiteBg(img))
  img.src = dataUrl
  return null
}

// ── Visual effects ──
export interface SwingEffect {
  x: number; y: number; facing: Facing
  drawingDataUrl: string; timer: number; maxTimer: number
}
export interface ImpactEffect {
  x: number; y: number; timer: number; maxTimer: number
}

const swings: SwingEffect[] = []
const impacts: ImpactEffect[] = []

export function addSwingEffect(x: number, y: number, facing: Facing, dataUrl: string): void {
  swings.push({ x, y, facing, drawingDataUrl: dataUrl, timer: 380, maxTimer: 380 })
}
export function addImpactEffect(x: number, y: number): void {
  impacts.push({ x, y, timer: 280, maxTimer: 280 })
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  localPlayer: PlayerState,
  remotePlayers: PlayerState[],
  projectiles: Projectile[],
  items: MapItem[],
  time: number,
  dt: number,
  shake: number,
): void {
  _screenShake = Math.max(0, _screenShake - dt * 0.003)

  const ox = shake > 0 ? (Math.random() - 0.5) * shake * 8 : 0
  const oy = shake > 0 ? (Math.random() - 0.5) * shake * 8 : 0

  ctx.save()
  ctx.translate(ox, oy)

  drawBackground(ctx)
  drawItems(ctx, items, time)

  const players = [localPlayer, ...remotePlayers].sort((a, b) => a.y - b.y)
  for (const p of players) {
    if (!p.dead) drawPlayer(ctx, p, time)
  }

  tickAndDrawSwings(ctx, dt)
  drawProjectiles(ctx, projectiles)
  tickAndDrawImpacts(ctx, dt)

  ctx.restore()
}

const TILE_FILL: Record<string, string> = {
  grass:  '#4d7a3a',
  flower: '#5c8c46',
  sand:   '#c8a86e',
  stone:  '#6b6b7a',
  water:  '#2a5fa8',
}
const TILE_ACCENT: Record<string, string> = {
  grass:  '#3e6530',
  flower: '#7ec44a',
  sand:   '#d8b87e',
  stone:  '#8585a0',
  water:  '#1a4a8a',
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const T = TILE_SIZE
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const tile = GAME_MAP[row][col]
      ctx.fillStyle = TILE_FILL[tile] ?? '#4d7a3a'
      ctx.fillRect(col * T, row * T, T, T)
      // subtle checkerboard on walkable tiles
      if ((row + col) % 2 === 1 && (tile === 'grass' || tile === 'flower' || tile === 'sand')) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)'
        ctx.fillRect(col * T, row * T, T, T)
      }
      // accent border for non-grass tiles
      if (tile !== 'grass') {
        ctx.strokeStyle = TILE_ACCENT[tile] ?? '#3e6530'
        ctx.lineWidth = 1
        ctx.strokeRect(col * T + 0.5, row * T + 0.5, T - 1, T - 1)
      }
      // flower dots
      if (tile === 'flower') {
        ctx.fillStyle = 'rgba(255,210,255,0.7)'
        ctx.beginPath()
        ctx.arc(col * T + T * 0.35, row * T + T * 0.4, 2, 0, Math.PI * 2)
        ctx.arc(col * T + T * 0.65, row * T + T * 0.6, 2, 0, Math.PI * 2)
        ctx.fill()
      }
      // water shimmer lines
      if (tile === 'water') {
        ctx.strokeStyle = 'rgba(150,200,255,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(col * T + 4, row * T + T * 0.4)
        ctx.lineTo(col * T + T - 4, row * T + T * 0.4)
        ctx.moveTo(col * T + 8, row * T + T * 0.65)
        ctx.lineTo(col * T + T - 8, row * T + T * 0.65)
        ctx.stroke()
      }
    }
  }
}

const CHAR_W = 52, CHAR_H = 62

function drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerState, time: number): void {
  const assets = getAssets()
  const { x, y, element, hitFlash, isDefending, shieldTimer, attackLevel, slotIndex } = player
  const stats = ELEMENT_STATS[element]
  const slot = PLAYER_SLOT_CONFIGS[slotIndex % PLAYER_SLOT_CONFIGS.length]

  ctx.save()
  ctx.translate(x, y)

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(0, CHAR_H / 2 - 6, 14, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  if (assets) {
    const { col, row, flipX } = getCharFrame(player, time, slot.spriteRow)
    const tintMode = hitFlash > 0 ? 'flash' : slot.tintMode
    const sheet = assets.tintedCharacters[tintMode]

    // Upgrade aura – pulsing rings behind the sprite
    if (attackLevel > 0) {
      const pulse = Math.sin(time * 0.004) * 0.5 + 0.5
      const ringR = 28 + pulse * 8
      ctx.save()
      ctx.shadowBlur = 18 + pulse * 14
      ctx.shadowColor = stats.glowColor
      ctx.strokeStyle = stats.glowColor
      ctx.globalAlpha = 0.35 + pulse * 0.3
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke()
      if (attackLevel > 1) {
        ctx.globalAlpha = 0.2 + pulse * 0.2
        ctx.beginPath(); ctx.arc(0, 0, ringR + 10, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.restore()
    }

    drawSpriteFrame(ctx, sheet, col, row, -CHAR_W / 2, -CHAR_H / 2, CHAR_W, CHAR_H, flipX)
  } else {
    ctx.fillStyle = hitFlash > 0 ? '#FF8888' : stats.color
    ctx.beginPath(); ctx.roundRect(-14, -CHAR_H / 2, 28, CHAR_H, 6); ctx.fill()
  }

  // Shield ring
  if (isDefending || shieldTimer > 0) {
    ctx.strokeStyle = '#FFE082'; ctx.lineWidth = 3; ctx.globalAlpha = 0.8
    ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 1
  }

  ctx.restore()

  // Name tag
  ctx.font = 'bold 10px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.fillStyle = slot.nameColor
  ctx.lineWidth = 3
  ctx.strokeText(player.name.slice(0, 10), x, y - CHAR_H / 2 - 16)
  ctx.fillText(player.name.slice(0, 10), x, y - CHAR_H / 2 - 16)

  // HP bar
  const hpRatio = Math.max(0, player.hp / player.maxHp)
  const BW = 48
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - BW/2 - 1, y - CHAR_H/2 - 11, BW+2, 7)
  ctx.fillStyle = hpRatio > 0.5 ? '#5cb85c' : hpRatio > 0.25 ? '#f0a500' : '#d9534f'
  ctx.fillRect(x - BW/2, y - CHAR_H/2 - 10, BW * hpRatio, 5)

  // Attack level stars
  if (attackLevel > 0) {
    ctx.font = '12px sans-serif'
    for (let i = 0; i < attackLevel; i++) {
      ctx.fillStyle = '#FFD700'
      ctx.fillText('★', x - 6 + i * 14, y - CHAR_H/2 - 14)
    }
  }
}

function tickAndDrawSwings(ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = swings.length - 1; i >= 0; i--) {
    const s = swings[i]
    s.timer -= dt
    if (s.timer <= 0) { swings.splice(i, 1); continue }

    const prog = 1 - s.timer / s.maxTimer
    const img = getWeaponImage(s.drawingDataUrl)

    const dirOffset: Record<Facing, [number, number]> = {
      right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1]
    }
    const [dx, dy] = dirOffset[s.facing]
    const reach = 20 + prog * 36
    const wx = s.x + dx * reach
    const wy = s.y + dy * reach

    const angle = Math.atan2(dy, dx) + (prog - 0.5) * 2.2

    ctx.save()
    ctx.translate(wx, wy)
    ctx.rotate(angle)
    ctx.globalAlpha = prog < 0.8 ? 1 : (1 - prog) * 5

    if (img) {
      const sz = 44
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz)
    } else {
      // Slash arc fallback
      const stats = ELEMENT_STATS['Jin']
      ctx.strokeStyle = stats.glowColor
      ctx.shadowColor = stats.glowColor
      ctx.shadowBlur = 12
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0, 0, 24, -0.8, 0.8)
      ctx.stroke()
    }

    // Slash arc always drawn over weapon image for impact feel
    ctx.shadowColor = '#FFFFFF'
    ctx.shadowBlur = 8
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - prog)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, 20, -0.9, 0.9)
    ctx.stroke()

    ctx.restore()
  }
}

function tickAndDrawImpacts(ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = impacts.length - 1; i >= 0; i--) {
    const e = impacts[i]
    e.timer -= dt
    if (e.timer <= 0) { impacts.splice(i, 1); continue }

    const prog = 1 - e.timer / e.maxTimer
    const r = prog * 28
    const alpha = (1 - prog) * 0.9

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#FFD700'
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur = 10
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2)
    ctx.stroke()

    // Spark lines
    const sparks = 6
    for (let s = 0; s < sparks; s++) {
      const a = (s / sparks) * Math.PI * 2 + prog
      ctx.beginPath()
      ctx.moveTo(e.x + Math.cos(a) * r * 0.4, e.y + Math.sin(a) * r * 0.4)
      ctx.lineTo(e.x + Math.cos(a) * r * 1.2, e.y + Math.sin(a) * r * 1.2)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]): void {
  for (const proj of projectiles) {
    const stats = ELEMENT_STATS[proj.element]
    const age = proj.age / proj.lifespan
    const img = proj.drawingDataUrl ? getWeaponImage(proj.drawingDataUrl) : null

    const angle = Math.atan2(proj.vy, proj.vx)

    ctx.save()
    ctx.translate(proj.x, proj.y)
    ctx.rotate(angle + Math.PI / 4 + age * Math.PI * 4) // spinning
    ctx.globalAlpha = 1 - age * 0.4

    if (img) {
      // Element-colored glow behind the drawing
      ctx.shadowBlur = 16
      ctx.shadowColor = stats.glowColor
      const sz = proj.radius * 2.6
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz)
    } else {
      ctx.shadowBlur = 14
      ctx.shadowColor = stats.glowColor
      ctx.fillStyle = stats.color
      ctx.beginPath()
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.beginPath()
      ctx.arc(-proj.radius * 0.3, -proj.radius * 0.3, proj.radius * 0.35, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}

function drawItems(ctx: CanvasRenderingContext2D, items: MapItem[], time: number): void {
  const assets = getAssets()

  for (const item of items) {
    const bob = Math.sin(time * 0.003) * 4
    const pulse = Math.sin(time * 0.005) * 0.15 + 0.85

    ctx.save()
    ctx.translate(item.x, item.y + bob)
    ctx.globalAlpha = pulse

    if (item.type === 'PowerShard' && assets) {
      // Crystal from props sheet col 0
      ctx.shadowBlur = 20
      ctx.shadowColor = '#00FFC8'
      drawSpriteFrame(ctx, assets.props, 0, 0, -18, -22, 36, 44, false)
    } else if (item.type === 'SpeedBoost') {
      // Lightning bolt drawn on canvas
      drawSpeedIcon(ctx)
    } else if (item.type === 'ShieldRune') {
      // Shield icon drawn on canvas
      drawShieldIcon(ctx)
    }

    ctx.restore()
  }
}

function drawSpeedIcon(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 18
  ctx.shadowColor = '#00E5FF'
  // Bolt shape
  ctx.fillStyle = '#00E5FF'
  ctx.beginPath()
  ctx.moveTo(4, -18)
  ctx.lineTo(-4, -2)
  ctx.lineTo(2, -2)
  ctx.lineTo(-4, 18)
  ctx.lineTo(10, 0)
  ctx.lineTo(4, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.globalAlpha *= 0.4
  ctx.beginPath()
  ctx.moveTo(3, -16)
  ctx.lineTo(-2, -2)
  ctx.lineTo(2, -2)
  ctx.closePath()
  ctx.fill()
}

function drawShieldIcon(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 18
  ctx.shadowColor = '#CE93D8'
  ctx.fillStyle = '#9C27B0'
  ctx.beginPath()
  ctx.moveTo(0, -18)
  ctx.lineTo(14, -10)
  ctx.lineTo(14, 4)
  ctx.bezierCurveTo(14, 14, 0, 20, 0, 20)
  ctx.bezierCurveTo(0, 20, -14, 14, -14, 4)
  ctx.lineTo(-14, -10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#CE93D8'
  ctx.globalAlpha *= 0.6
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(10, -8)
  ctx.lineTo(10, 2)
  ctx.bezierCurveTo(10, 10, 0, 16, 0, 16)
  ctx.bezierCurveTo(0, 16, -10, 10, -10, 2)
  ctx.lineTo(-10, -8)
  ctx.closePath()
  ctx.fill()
}
