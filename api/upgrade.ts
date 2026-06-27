import type { VercelRequest, VercelResponse } from '@vercel/node'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(process.cwd(), '.env.local') })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { imageBase64, element, weaponName, isMelee, description } = req.body as {
    imageBase64: string
    element: string
    weaponName: string
    isMelee: boolean
    description: string
  }

  const prompt = `You are the AI for a Wu Xing battle game. A player's weapon has powered up after collecting a crystal!

Current weapon: "${weaponName}" (${element} element, ${isMelee ? 'melee' : 'ranged'})
Current description: "${description}"

Looking at this drawing, create an UPGRADED Level 2 version:
- Enhanced weapon name: same thematic feel but more powerful/legendary (max 3 words)
- Upgraded description: one dramatic, evocative sentence about its powered-up form. Should feel noticeably more epic than the original.

Respond ONLY with valid JSON:
{"weaponName":"...","description":"..."}`

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 128,
    messages: [
      {
        role: 'user',
        content: [
          ...(imageBase64 ? [{
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
          }] : []),
          { type: 'text', text: prompt }
        ]
      }
    ]
  }

  try {
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
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
