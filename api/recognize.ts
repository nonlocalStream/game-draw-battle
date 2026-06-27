import type { VercelRequest, VercelResponse } from '@vercel/node'
import { config } from 'dotenv'
import path from 'path'

// Load .env.local when running via vercel dev (not available in process.env by default)
config({ path: path.join(process.cwd(), '.env.local') })

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
  }

  const { imageBase64, mediaType } = req.body as { imageBase64: string; mediaType?: string }
  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64 in request body' })
  }

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType ?? 'image/png', data: imageBase64 } },
          { type: 'text', text: PROMPT_TEXT }
        ]
      }
    ]
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body)
  })

  const data = await anthropicRes.json()
  return res.status(anthropicRes.status).json(data)
}
