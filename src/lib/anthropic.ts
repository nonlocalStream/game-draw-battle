import type { WeaponData, WeaponUpgrade, Element } from '../types'
import { randomElement } from '../game/elements'

const ELEMENT_WEAPON_NAMES: Record<Element, string[]> = {
  Jin: ['Iron Fang', 'Silver Edge', 'Gold Crescent', 'Steel Bloom', 'Mirror Blade'],
  Mu: ['Vine Arrow', 'Root Spear', 'Bamboo Rain', 'Leaf Dart', 'Branch Whip'],
  Shui: ['Tide Wave', 'Ice Shard', 'Mist Veil', 'Deep Current', 'Frost Needle'],
  Huo: ['Ember Burst', 'Phoenix Tail', 'Solar Flare', 'Cinder Spark', 'Blaze Ring'],
  Tu: ['Boulder Fist', 'Earth Tremor', 'Stone Guard', 'Clay Hammer', 'Dust Crush'],
}

const ELEMENT_DESCRIPTIONS: Record<Element, string[]> = {
  Jin: ['Cold as forged steel, sharp as winter frost.', 'A weapon that cuts through illusion and bone alike.'],
  Mu: ['Patient as a forest, deadly as its thorns.', 'Strikes from the shadows of the canopy above.'],
  Shui: ['Relentless as the tide, it wears down all resistance.', 'Flows where least expected, chills to the bone.'],
  Huo: ['Burns bright and fierce—but briefly.', 'Where it lands, nothing grows back the same.'],
  Tu: ['Slow to anger, impossible to move once set.', 'The earth does not hurry, yet always arrives.'],
}

export interface DebugEntry {
  timestamp: string
  apiKeyPresent: boolean
  apiKeyPrefix: string
  status: 'pending' | 'success' | 'error' | 'fallback'
  statusCode?: number
  requestPrompt: string
  rawResponse?: string
  parsedResult?: Partial<WeaponData>
  error?: string
  durationMs?: number
}

let _debugListener: ((entry: DebugEntry) => void) | null = null
export function setDebugListener(fn: ((entry: DebugEntry) => void) | null) {
  _debugListener = fn
}

function emit(entry: DebugEntry) {
  console.log('[Draw Battle API]', entry)
  _debugListener?.(entry)
}

function fallbackWeapon(drawingDataUrl: string): WeaponData {
  const element = randomElement()
  const names = ELEMENT_WEAPON_NAMES[element]
  const descs = ELEMENT_DESCRIPTIONS[element]
  const isMelee = ['Jin', 'Tu'].includes(element)
  return {
    element,
    weaponName: names[Math.floor(Math.random() * names.length)],
    isMelee,
    description: descs[Math.floor(Math.random() * descs.length)],
    drawingDataUrl
  }
}

const PROMPT_TEXT = `You are the AI for a battle game based on the Wu Xing (five elements).
Classify what this player drew into EXACTLY one of these elements:
- Jin (Metal): swords, axes, coins, shields, metal objects, geometric shapes
- Mu (Wood): trees, bows, arrows, leaves, plants, branches, staffs
- Shui (Water): waves, drops, fish, ice, snowflakes, spirals, flowing shapes
- Huo (Fire): flames, sun, lightning, stars, explosions, spiky shapes
- Tu (Earth): mountains, rocks, hands, fists, circles, round heavy shapes

Also determine:
1. A creative weapon name (2-3 words, poetic)
2. Whether this is melee (close range) or ranged (projectile). Swords/fists/axes = melee. Bows/flames/waves = ranged.

Respond ONLY with valid JSON, no extra text:
{"element":"Jin|Mu|Shui|Huo|Tu","weaponName":"...","isMelee":true|false,"description":"one sentence of flavor text"}`

export async function recognizeDrawing(drawingDataUrl: string): Promise<WeaponData> {
  // API key is checked server-side; client only needs to know if it was configured
  const clientKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string
  const apiKeyPresent = !!clientKey
  const apiKeyPrefix = clientKey ? `${clientKey.slice(0, 16)}...` : '(server-side)'

  const base64 = drawingDataUrl.split(',')[1]

  const entry: DebugEntry = {
    timestamp: new Date().toISOString(),
    apiKeyPresent: true, // key lives on server now
    apiKeyPrefix,
    status: 'pending',
    requestPrompt: PROMPT_TEXT,
  }
  emit({ ...entry })

  const t0 = Date.now()

  try {
    const res = await fetch('/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 })
    })

    const durationMs = Date.now() - t0

    if (!res.ok) {
      const errText = await res.text()
      emit({ ...entry, status: 'error', statusCode: res.status, rawResponse: errText, durationMs, error: `HTTP ${res.status}: ${errText}` })
      return fallbackWeapon(drawingDataUrl)
    }

    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)

    if (!match) {
      emit({ ...entry, status: 'error', statusCode: res.status, rawResponse: text, durationMs, error: 'No JSON found in response' })
      return fallbackWeapon(drawingDataUrl)
    }

    const parsed = JSON.parse(match[0]) as Partial<WeaponData>
    const validElements: Element[] = ['Jin', 'Mu', 'Shui', 'Huo', 'Tu']

    if (!validElements.includes(parsed.element as Element)) {
      emit({ ...entry, status: 'error', statusCode: res.status, rawResponse: text, parsedResult: parsed, durationMs, error: `Invalid element: "${parsed.element}"` })
      return fallbackWeapon(drawingDataUrl)
    }

    emit({ ...entry, status: 'success', statusCode: res.status, rawResponse: text, parsedResult: parsed, durationMs })

    return {
      element: parsed.element as Element,
      weaponName: parsed.weaponName ?? 'Mystery Weapon',
      isMelee: parsed.isMelee ?? false,
      description: parsed.description ?? '',
      drawingDataUrl
    }
  } catch (err) {
    const durationMs = Date.now() - t0
    const msg = err instanceof Error ? err.message : String(err)
    emit({ ...entry, status: 'error', rawResponse: msg, durationMs, error: msg })
    return fallbackWeapon(drawingDataUrl)
  }
}

export async function generateUpgrade(weapon: WeaponData): Promise<WeaponUpgrade> {
  const base64 = weapon.drawingDataUrl?.split(',')[1] ?? ''
  try {
    const res = await fetch('/api/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        element: weapon.element,
        weaponName: weapon.weaponName,
        isMelee: weapon.isMelee,
        description: weapon.description,
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in upgrade response')
    const parsed = JSON.parse(match[0]) as Partial<WeaponUpgrade>
    return {
      weaponName: parsed.weaponName ?? `${weapon.weaponName} +`,
      description: parsed.description ?? 'Its power has awakened.',
    }
  } catch {
    return {
      weaponName: `${weapon.weaponName} ★`,
      description: 'A surge of elemental energy transforms the weapon.',
    }
  }
}
