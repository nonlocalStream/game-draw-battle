# Draw Battle ⚔️

A 2-player top-down pixel battle game where you **draw your weapon** and Claude classifies it into one of the five Wu Xing elements.

🎮 **Play now:** [gamedrawbattleclaude.vercel.app](https://gamedrawbattleclaude.vercel.app)

---

## How to Play

1. **Enter a room code** — share it with your opponent (or play Solo vs CPU)
2. **Draw your weapon** — anything: sword, wave, flame, tree, rock…
3. **Claude classifies it** into a Wu Xing element and gives it a name
4. **Battle!** — top-down arena, fight until one player's HP hits 0
5. **Pick up items** mid-battle to power up, speed boost, or raise a shield
6. **Upgrade** — collect the crystal shard to evolve your weapon to Lv2

---

## Wu Xing Elements

| Element | 金 Jin (Metal) | 木 Mu (Wood) | 水 Shui (Water) | 火 Huo (Fire) | 土 Tu (Earth) |
|---------|--------------|-------------|----------------|--------------|--------------|
| Style | Melee | Ranged | Ranged (slows) | Ranged | Melee |
| Beats | Mu | Tu | Huo | Jin | Shui |

Each element has unique HP, speed, attack, and defense stats. Hitting a weaker element deals +20% damage.

---

## Controls

| Action | Key |
|--------|-----|
| Move | Arrow Keys |
| Attack | Space |
| Defend | Shift |

---

## Features

- **Claude Vision** classifies drawings into Wu Xing elements
- **Weapon upgrade** — Claude generates a Lv2 version of your weapon asynchronously
- **Gallery** — browse past weapons, flip between Lv1/Lv2, reuse in future games
- **Multiplayer** via Supabase Realtime (broadcast channels + presence)
- **Full-screen arena** with sprite animations, swing effects, impact sparks
- **Your drawing** is the projectile — it flies across the screen with an element glow
- **Deterministic item placement** — seeded from room code so both clients match

---

## Tech Stack

- **Frontend:** Vite + React + TypeScript
- **Rendering:** Canvas 2D API (no game engine)
- **AI:** Anthropic Claude claude-sonnet-4-6 vision (via Vercel serverless proxy)
- **Multiplayer:** Supabase Realtime broadcast + presence
- **Deploy:** Vercel

---

## Local Dev

```bash
# Install
npm install

# Create .env.local
ANTHROPIC_API_KEY=sk-ant-...
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...

# Run (must use vercel dev for API routes)
npx vercel dev --yes
```

> **Note:** Use `npx vercel dev` not `npm run dev` — the drawing recognition API routes require the Vercel serverless runtime.

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | Server (`.env.local`) | Claude API — used by serverless functions |
| `VITE_ANTHROPIC_API_KEY` | Server (`.env.local`) | Same key, alternate name |
| `VITE_SUPABASE_URL` | Client + Vercel | Supabase project URL |
| `VITE_SUPABASE_KEY` | Client + Vercel | Supabase publishable (anon) key |

For Vercel deployment, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` in your project's Environment Variables settings.
