import { useState, useCallback, useEffect, useRef } from 'react'
import type { GamePhase, WeaponData, GameState, GameEndStats } from './types'
import { RoomLobby } from './components/RoomLobby'
import { DrawingCanvas } from './components/DrawingCanvas'
import { WeaponDisplay } from './components/WeaponDisplay'
import { GameCanvas } from './components/GameCanvas'
import { Gallery, saveWeaponToGallery, applyUpgradeToGallery } from './components/Gallery'
import { DebugPanel, type DebugSettings } from './components/DebugPanel'
import { recognizeDrawing, generateUpgrade, setDebugListener, type DebugEntry } from './lib/anthropic'
import { createPlayer } from './game/player'
import { randomElement, ELEMENT_STATS } from './game/elements'
import { getRoomChannel, type GameChannel } from './lib/supabase'

function generatePlayerId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const playerId = generatePlayerId()

// 6 spawn positions spread around the arena (640×480)
const START_POSITIONS = [
  { x: 100, y: 240 },
  { x: 540, y: 240 },
  { x: 320, y:  96 },
  { x: 320, y: 384 },
  { x: 160, y: 160 },
  { x: 480, y: 320 },
]

type RoomMember = { name: string; status: 'drawing' | 'ready' }

export default function App() {
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([])
  const [debugSettings, setDebugSettings] = useState<DebugSettings>({ drawTimeLimit: 60 })
  useEffect(() => {
    setDebugListener(entry => setDebugEntries(prev => [...prev, entry]))
    return () => setDebugListener(null)
  }, [])

  const [phase, setPhase] = useState<GamePhase>('menu')
  const [showGallery, setShowGallery] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isSolo, setIsSolo] = useState(false)
  const [myWeapon, setMyWeapon] = useState<WeaponData | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [winner, setWinner] = useState<string | null>(null)
  const [gameEndStats, setGameEndStats] = useState<GameEndStats | null>(null)

  // N-player room state
  const [roomMembers, setRoomMembers] = useState<Map<string, RoomMember>>(new Map())
  const [opponentWeapons, setOpponentWeapons] = useState<Map<string, WeaponData>>(new Map())
  const [battleReadyIds, setBattleReadyIds] = useState<Set<string>>(new Set())
  // Refs so async handlers can read current state without stale closures
  const roomMembersRef = useRef<Map<string, RoomMember>>(new Map())
  useEffect(() => { roomMembersRef.current = roomMembers }, [roomMembers])
  const myWeaponRef = useRef<WeaponData | null>(null)
  useEffect(() => { myWeaponRef.current = myWeapon }, [myWeapon])

  const myWeaponGalleryId = useRef<string | null>(null)
  const [channelRef] = useState<{ ch: GameChannel | null }>({ ch: null })

  useEffect(() => {
    return () => { channelRef.ch?.unsubscribe() }
  }, [channelRef])

  const handleJoinRoom = useCallback((code: string, name: string, solo: boolean) => {
    setPlayerName(name)
    setRoomCode(code)
    setIsSolo(solo)
    setPhase('drawing')

    if (!solo) {
      const ch = getRoomChannel(code, playerId)
      if (ch) {
        channelRef.ch = ch
        ch
          .on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState() as Record<string, { playerId: string; name: string; status: 'drawing' | 'ready' }[]>
            const members = new Map<string, RoomMember>()
            for (const entries of Object.values(state)) {
              for (const m of entries) {
                // Don't downgrade status from ready → drawing (broadcast "ready" is definitive)
                const existing = roomMembersRef.current.get(m.playerId)
                members.set(m.playerId, {
                  name: m.name,
                  status: existing?.status === 'ready' ? 'ready' : m.status
                })
              }
            }
            setRoomMembers(members)
          })
          .on('presence', { event: 'join' }, () => {
            // Re-broadcast our weapon when a new player joins so late-joiners get our data
            if (myWeaponRef.current) {
              ch.send({
                type: 'broadcast',
                event: 'ready',
                payload: { playerId, name, data: myWeaponRef.current }
              })
            }
          })
          .on('broadcast', { event: 'ready' }, ({ payload }: { payload: { playerId: string; name: string; data: WeaponData } }) => {
            if (payload.playerId === playerId) return
            setOpponentWeapons(prev => new Map(prev).set(payload.playerId, payload.data))
            setRoomMembers(prev => {
              const next = new Map(prev)
              const existing = next.get(payload.playerId)
              next.set(payload.playerId, { name: payload.name ?? existing?.name ?? 'Player', status: 'ready' })
              return next
            })
          })
          .on('broadcast', { event: 'battle_start' }, ({ payload }: { payload: { playerId: string } }) => {
            if (payload.playerId === playerId) return
            setBattleReadyIds(prev => new Set([...prev, payload.playerId]))
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              ch.track({ playerId, name, status: 'drawing' })
            }
          })
      }
    }
  }, [channelRef])

  const broadcastReady = useCallback((weapon: WeaponData) => {
    channelRef.ch?.send({
      type: 'broadcast',
      event: 'ready',
      payload: { playerId, name: playerName, data: weapon }
    })
  }, [channelRef, playerName])

  const broadcastBattleStart = useCallback(() => {
    channelRef.ch?.send({ type: 'broadcast', event: 'battle_start', payload: { playerId } })
  }, [channelRef])

  const handleDrawingSubmit = useCallback(async (dataUrl: string) => {
    setRecognizing(true)
    setPhase('recognition')

    const weapon = await recognizeDrawing(dataUrl)
    setMyWeapon(weapon)

    const galleryId = `w_${Date.now()}`
    myWeaponGalleryId.current = galleryId
    saveWeaponToGallery({ ...weapon, id: galleryId } as WeaponData & { id: string })
    setRecognizing(false)

    if (isSolo) {
      const cpuElement = randomElement()
      setOpponentWeapons(new Map([['cpu', {
        element: cpuElement,
        weaponName: 'CPU Weapon',
        isMelee: ELEMENT_STATS[cpuElement].isMelee,
        description: 'A formidable foe.',
        drawingDataUrl: ''
      }]]))
    } else {
      broadcastReady(weapon)
      setPhase('waiting')
    }
  }, [isSolo, broadcastReady])

  const handleGallerySelect = useCallback((weapon: WeaponData) => {
    setMyWeapon(weapon)
    setShowGallery(false)

    if (isSolo) {
      const cpuElement = randomElement()
      setOpponentWeapons(new Map([['cpu', {
        element: cpuElement, weaponName: 'CPU Weapon',
        isMelee: ELEMENT_STATS[cpuElement].isMelee,
        description: '', drawingDataUrl: ''
      }]]))
      setPhase('recognition')
    } else {
      broadcastReady(weapon)
      setPhase('waiting')
    }
  }, [isSolo, broadcastReady])

  const startBattle = useCallback(() => {
    if (!myWeapon) return
    if (!isSolo && opponentWeapons.size === 0) return

    // Deterministic slot assignment: sort all player IDs alphabetically
    const allIds = [playerId, ...(isSolo ? ['cpu'] : Array.from(opponentWeapons.keys()))].sort()
    const mySlot = allIds.indexOf(playerId)
    const myPos = START_POSITIONS[mySlot % START_POSITIONS.length]

    const localPlayer = createPlayer(
      playerId, playerName, myWeapon.element, myWeapon.weaponName, myWeapon.isMelee,
      myWeapon.drawingDataUrl, myPos.x, myPos.y, mySlot
    )

    const remotePlayers = Array.from(opponentWeapons.entries()).map(([pid, weapon]) => {
      const slot = allIds.indexOf(pid)
      const pos = START_POSITIONS[slot % START_POSITIONS.length]
      const name = isSolo ? '🤖 CPU' : (roomMembers.get(pid)?.name ?? 'Player')
      return createPlayer(pid, name, weapon.element, weapon.weaponName, weapon.isMelee,
        weapon.drawingDataUrl, pos.x, pos.y, slot)
    })

    setGameState({ localPlayer, remotePlayers, projectiles: [], items: [], phase: 'battle', winner: null, tick: 0 })
    setPhase('battle')

    // Release the drawing-phase channel so useMultiplayer gets clean bandwidth in battle
    if (!isSolo) {
      channelRef.ch?.unsubscribe()
      channelRef.ch = null
    }

    generateUpgrade(myWeapon).then(upgrade => {
      setMyWeapon(prev => prev ? { ...prev, upgrade } : prev)
      if (myWeaponGalleryId.current) applyUpgradeToGallery(myWeaponGalleryId.current, upgrade)
    })
  }, [myWeapon, playerName, isSolo, opponentWeapons, roomMembers, channelRef])

  const handleGameOver = useCallback((w: string, stats: GameEndStats) => {
    setWinner(w)
    setGameEndStats(stats)
    setPhase('gameover')
  }, [])

  const resetGame = useCallback(() => {
    setPhase('menu')
    setMyWeapon(null)
    setOpponentWeapons(new Map())
    setRoomMembers(new Map())
    setBattleReadyIds(new Set())
    setGameState(null)
    setWinner(null)
    setGameEndStats(null)
    myWeaponGalleryId.current = null
    channelRef.ch?.unsubscribe()
    channelRef.ch = null
  }, [channelRef])

  // Solo: auto-proceed once CPU weapon is set
  useEffect(() => {
    if (isSolo && myWeapon && opponentWeapons.size > 0 && phase === 'recognition') return
    if (isSolo && myWeapon && opponentWeapons.size > 0 && phase === 'waiting') {
      setPhase('recognition')
    }
  }, [myWeapon, opponentWeapons, phase, isSolo])

  // Multiplayer: auto-proceed from 'waiting' once all room members are ready
  useEffect(() => {
    if (isSolo || phase !== 'waiting' || !myWeapon) return
    const others = Array.from(roomMembers.keys()).filter(id => id !== playerId)
    if (others.length > 0 && others.every(id => opponentWeapons.has(id))) {
      const t = setTimeout(() => setPhase('recognition'), 100)
      return () => clearTimeout(t)
    }
  }, [myWeapon, opponentWeapons, roomMembers, phase, isSolo])

  // Multiplayer: start battle when all members have clicked Start Battle
  useEffect(() => {
    if (isSolo || phase !== 'recognition' || !myWeapon) return
    if (!battleReadyIds.has(playerId)) return
    const allIds = Array.from(roomMembers.keys())
    if (allIds.length > 0 && allIds.every(id => battleReadyIds.has(id))) {
      startBattle()
    }
  }, [battleReadyIds, roomMembers, phase, isSolo, myWeapon, startBattle])

  const opponents = Array.from(opponentWeapons.entries())
  const allOpponentsReady = isSolo
    ? opponentWeapons.size > 0
    : (() => {
        const others = Array.from(roomMembers.keys()).filter(id => id !== playerId)
        return others.length > 0 && others.every(id => opponentWeapons.has(id))
      })()

  return (
    <div className="app">
      {showGallery && (
        <Gallery onSelect={handleGallerySelect} onClose={() => setShowGallery(false)} />
      )}

      {phase === 'menu' && (
        <RoomLobby onJoin={handleJoinRoom} onShowGallery={() => setShowGallery(true)} />
      )}

      {phase === 'drawing' && (
        <DrawingCanvas
          onSubmit={handleDrawingSubmit}
          isSolo={isSolo}
          roomMembers={roomMembers}
          playerId={playerId}
          onOpenGallery={() => setShowGallery(true)}
          timeLimit={debugSettings.drawTimeLimit}
        />
      )}

      {(phase === 'recognition' || phase === 'waiting') && (
        <div className="recognition-phase">
          <h2 className="phase-title">
            {recognizing ? '✨ Sensing your element...' : '⚔️ Weapons'}
          </h2>

          {recognizing && (
            <div className="recognizing-anim">
              <div className="spin-ring" />
              <p>The spirits are reading your drawing...</p>
            </div>
          )}

          {myWeapon && !recognizing && (
            <div className="recognition-layout">
              <WeaponDisplay weapon={myWeapon} label="Your Weapon" />

              {isSolo ? (
                opponents[0] ? (
                  <WeaponDisplay weapon={opponents[0][1]} label="🤖 CPU" />
                ) : (
                  <div className="waiting-card"><div className="spin-ring" /></div>
                )
              ) : (
                Array.from(roomMembers.entries())
                  .filter(([id]) => id !== playerId)
                  .map(([id, member]) => {
                    const weapon = opponentWeapons.get(id)
                    return weapon ? (
                      <WeaponDisplay key={id} weapon={weapon} label={member.name} />
                    ) : (
                      <div key={id} className="waiting-card">
                        <div className="spin-ring" />
                        <p>{member.name} drawing...</p>
                      </div>
                    )
                  })
              )}

              {(!isSolo && roomMembers.size <= 1) && (
                <div className="waiting-card">
                  <div className="spin-ring" />
                  <p>Waiting for players to join...</p>
                </div>
              )}

              {myWeapon && allOpponentsReady && (
                isSolo ? (
                  <button className="start-battle-btn" onClick={startBattle}>
                    ⚔️ Start Battle!
                  </button>
                ) : battleReadyIds.has(playerId) ? (
                  <div className="battle-ready-wait">
                    <div className="spin-ring" />
                    <p>✅ Ready! Waiting for {Array.from(roomMembers.keys()).filter(id => !battleReadyIds.has(id)).length} more...</p>
                  </div>
                ) : (
                  <button className="start-battle-btn" onClick={() => {
                    broadcastBattleStart()
                    setBattleReadyIds(prev => new Set([...prev, playerId]))
                  }}>
                    ⚔️ Start Battle!
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {phase === 'battle' && gameState && (
        <GameCanvas
          initialState={gameState}
          roomCode={roomCode}
          isSolo={isSolo}
          myWeapon={myWeapon}
          onGameOver={handleGameOver}
        />
      )}

      {phase === 'gameover' && (
        <div className="gameover-screen">
          <div className="gameover-card">
            <div className="confetti-row">🎊 🏆 🎊</div>
            <h1 className="winner-text">{winner} Wins!</h1>

            {gameEndStats && (() => {
              const sorted = [...gameEndStats.players].sort((a, b) =>
                a.survived === b.survived ? b.hp / b.maxHp - a.hp / a.maxHp : (a.survived ? -1 : 1)
              )
              const durationSec = Math.round(gameEndStats.gameDurationMs / 1000)
              const myIsWinner = gameEndStats.players.find(p => p.isLocal)?.survived

              const awards: { icon: string; title: string; body: string }[] = []
              // MVP weapon – winner's weapon
              const winnerPlayer = sorted[0]
              if (winnerPlayer) {
                awards.push({ icon: '⚔️', title: 'MVP Weapon', body: `${winnerPlayer.name} · ${winnerPlayer.weaponName}` })
              }
              if (gameEndStats.myDamageDealt > 0) {
                awards.push({ icon: '💥', title: 'Damage Dealt', body: `${gameEndStats.myDamageDealt} total` })
              }
              if (gameEndStats.myKills > 0) {
                awards.push({ icon: '☠️', title: myIsWinner ? 'Clean Sweep' : 'Kills', body: `${gameEndStats.myKills} opponent${gameEndStats.myKills > 1 ? 's' : ''} eliminated` })
              }
              if (gameEndStats.myDamageTaken > 0 && !myIsWinner) {
                awards.push({ icon: '🛡️', title: 'Damage Taken', body: `${gameEndStats.myDamageTaken} absorbed` })
              }
              awards.push({ icon: '⏱️', title: 'Battle Duration', body: `${durationSec}s` })

              return (
                <>
                  {/* Player rankings */}
                  <div className="gameover-rankings">
                    {sorted.map((p, i) => (
                      <div key={p.id} className={`gameover-rank-row ${p.isLocal ? 'is-local' : ''} ${p.survived ? 'survived' : 'eliminated'}`}>
                        <span className="rank-medal">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                        <span className="rank-name">{p.name}{p.survived ? '' : ' 💀'}</span>
                        <span className="rank-weapon">{p.weaponName}</span>
                        <span className="rank-hp">{p.survived ? `${Math.ceil(p.hp)}/${p.maxHp} HP` : '0 HP'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Awards row */}
                  <div className="gameover-awards">
                    {awards.map(a => (
                      <div key={a.title} className="award-chip">
                        <span className="award-icon">{a.icon}</span>
                        <span className="award-title">{a.title}</span>
                        <span className="award-body">{a.body}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}

            <button className="lobby-btn primary" onClick={resetGame}>🏠 Back to Lobby</button>
          </div>
        </div>
      )}

      <DebugPanel entries={debugEntries} settings={debugSettings} onSettings={setDebugSettings} />
    </div>
  )
}
