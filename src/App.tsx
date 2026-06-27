import { useState, useCallback, useEffect, useRef } from 'react'
import type { GamePhase, WeaponData, GameState } from './types'
import { RoomLobby } from './components/RoomLobby'
import { DrawingCanvas } from './components/DrawingCanvas'
import { WeaponDisplay } from './components/WeaponDisplay'
import { GameCanvas } from './components/GameCanvas'
import { Gallery, saveWeaponToGallery, applyUpgradeToGallery } from './components/Gallery'
import { DebugPanel } from './components/DebugPanel'
import { recognizeDrawing, generateUpgrade, setDebugListener, type DebugEntry } from './lib/anthropic'
import { createPlayer } from './game/player'
import { randomElement, ELEMENT_STATS } from './game/elements'
import { CANVAS_WIDTH } from './game/terrain'
import { getRoomChannel } from './lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

function generatePlayerId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const playerId = generatePlayerId()

export default function App() {
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([])
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
  const [opponentWeapon, setOpponentWeapon] = useState<WeaponData | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [winner, setWinner] = useState<string | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [channelRef] = useState<{ ch: RealtimeChannel | null }>({ ch: null })

  // Track gallery id of current weapon so we can patch upgrade into it
  const myWeaponGalleryId = useRef<string | null>(null)

  useEffect(() => {
    return () => { channelRef.ch?.unsubscribe() }
  }, [channelRef])

  const handleJoinRoom = useCallback((code: string, name: string, solo: boolean) => {
    setPlayerName(name)
    setRoomCode(code)
    setIsSolo(solo)
    setPhase('drawing')

    if (!solo) {
      const ch = getRoomChannel(code)
      if (ch) {
        channelRef.ch = ch
        ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { playerId: string; data: WeaponData } }) => {
          if (payload.playerId !== playerId) {
            setOpponentWeapon(payload.data as WeaponData)
          }
        }).subscribe()
      }
    }
  }, [channelRef])

  const handleDrawingSubmit = useCallback(async (dataUrl: string) => {
    setRecognizing(true)
    setPhase('recognition')

    const weapon = await recognizeDrawing(dataUrl)
    setMyWeapon(weapon)

    // Save to gallery and capture the id for later upgrade patching
    const galleryId = `w_${Date.now()}`
    myWeaponGalleryId.current = galleryId
    saveWeaponToGallery({ ...weapon, id: galleryId } as WeaponData & { id: string })
    setRecognizing(false)

    if (isSolo) {
      const cpuElement = randomElement()
      setOpponentWeapon({
        element: cpuElement,
        weaponName: 'CPU Weapon',
        isMelee: ELEMENT_STATS[cpuElement].isMelee,
        description: 'A formidable foe.',
        drawingDataUrl: ''
      })
    } else {
      channelRef.ch?.send({
        type: 'broadcast',
        event: 'ready',
        payload: { playerId, data: weapon }
      })
      setPhase('waiting')
    }
  }, [isSolo, channelRef])

  const handleGallerySelect = useCallback((weapon: WeaponData) => {
    setMyWeapon(weapon)
    setShowGallery(false)
    if (isSolo) {
      const cpuElement = randomElement()
      setOpponentWeapon({
        element: cpuElement, weaponName: 'CPU Weapon',
        isMelee: ELEMENT_STATS[cpuElement].isMelee,
        description: '', drawingDataUrl: ''
      })
    }
    setPhase('recognition')
  }, [isSolo])

  const startBattle = useCallback(() => {
    if (!myWeapon || !opponentWeapon) return

    const localPlayer = createPlayer(
      playerId, playerName, myWeapon.element, myWeapon.weaponName, myWeapon.isMelee,
      myWeapon.drawingDataUrl, 80, 240
    )
    const remotePlayer = createPlayer(
      'cpu', isSolo ? '🤖 CPU' : 'Opponent',
      opponentWeapon.element, opponentWeapon.weaponName, opponentWeapon.isMelee,
      opponentWeapon.drawingDataUrl, CANVAS_WIDTH - 80, 240
    )

    setGameState({
      localPlayer, remotePlayer, projectiles: [], items: [],
      phase: 'battle', winner: null, tick: 0
    })
    setPhase('battle')

    // Fire async upgrade generation so it's ready when player picks up PowerShard
    generateUpgrade(myWeapon).then(upgrade => {
      setMyWeapon(prev => prev ? { ...prev, upgrade } : prev)
      if (myWeaponGalleryId.current) {
        applyUpgradeToGallery(myWeaponGalleryId.current, upgrade)
      }
    })
  }, [myWeapon, opponentWeapon, playerName, isSolo])

  const handleGameOver = useCallback((w: string) => {
    setWinner(w)
    setPhase('gameover')
  }, [])

  const resetGame = useCallback(() => {
    setPhase('menu')
    setMyWeapon(null)
    setOpponentWeapon(null)
    setGameState(null)
    setWinner(null)
    myWeaponGalleryId.current = null
    channelRef.ch?.unsubscribe()
    channelRef.ch = null
  }, [channelRef])

  // Auto-proceed once both weapons ready
  useEffect(() => {
    if (myWeapon && opponentWeapon && phase === 'waiting') {
      const t = setTimeout(() => setPhase('recognition'), 100)
      return () => clearTimeout(t)
    }
  }, [myWeapon, opponentWeapon, phase])

  // Pass upgraded weapon data into an active game (for when upgrade is ready after battle starts)
  const myWeaponRef = useRef(myWeapon)
  myWeaponRef.current = myWeapon

  return (
    <div className="app">
      {showGallery && (
        <Gallery onSelect={handleGallerySelect} onClose={() => setShowGallery(false)} />
      )}

      {phase === 'menu' && (
        <RoomLobby onJoin={handleJoinRoom} onShowGallery={() => setShowGallery(true)} />
      )}

      {phase === 'drawing' && (
        <DrawingCanvas onSubmit={handleDrawingSubmit} />
      )}

      {(phase === 'recognition' || phase === 'waiting') && (
        <div className="recognition-phase">
          <h2 className="phase-title">
            {recognizing ? '✨ Sensing your element...' : '⚔️ Your Weapon'}
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

              {opponentWeapon ? (
                <WeaponDisplay weapon={opponentWeapon} label={isSolo ? '🤖 CPU' : 'Opponent'} />
              ) : (
                <div className="waiting-card">
                  <div className="spin-ring" />
                  <p>Waiting for opponent...</p>
                </div>
              )}

              {opponentWeapon && (
                <button className="start-battle-btn" onClick={startBattle}>
                  ⚔️ Start Battle!
                </button>
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
            {myWeapon && (
              <div className="gameover-weapons">
                <WeaponDisplay weapon={myWeapon} label="Your Weapon" />
                {opponentWeapon && <WeaponDisplay weapon={opponentWeapon} label="Opponent" />}
              </div>
            )}
            <button className="lobby-btn primary" onClick={resetGame}>🏠 Back to Lobby</button>
          </div>
        </div>
      )}

      <DebugPanel entries={debugEntries} />
    </div>
  )
}
