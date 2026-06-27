import { useState } from 'react'

interface Props {
  onJoin: (roomCode: string, playerName: string, isSolo: boolean) => void
  onShowGallery: () => void
}

export function RoomLobby({ onJoin, onShowGallery }: Props) {
  const [roomCode, setRoomCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const handleJoin = () => {
    if (!name.trim()) { setError('Enter your name!'); return }
    if (!roomCode.trim() || roomCode.length < 4) { setError('Room code must be at least 4 characters'); return }
    onJoin(roomCode.trim().toUpperCase(), name.trim(), false)
  }

  const handleSolo = () => {
    if (!name.trim()) { setError('Enter your name first!'); return }
    onJoin('SOLO', name.trim(), true)
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-title-wrap">
          <h1 className="game-title">Draw Battle</h1>
          <p className="game-subtitle">⚔️ Draw · Fight · Win ⚔️</p>
          <div className="wu-xing-badges">
            {[['金','#FFD700'],['木','#4CAF50'],['水','#2196F3'],['火','#FF5722'],['土','#795548']].map(([c, col]) => (
              <span key={c} className="wu-badge" style={{ color: col as string, borderColor: col as string }}>{c}</span>
            ))}
          </div>
        </div>

        <div className="lobby-form">
          <input
            className="lobby-input"
            placeholder="Your name"
            maxLength={12}
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          <input
            className="lobby-input"
            placeholder="Room code (share with friend)"
            maxLength={12}
            value={roomCode}
            onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          {error && <p className="lobby-error">{error}</p>}

          <button className="lobby-btn primary" onClick={handleJoin}>
            🏰 Join Room
          </button>

          <div className="lobby-divider"><span>or</span></div>

          <button className="lobby-btn secondary" onClick={handleSolo}>
            🤖 Solo Practice (vs CPU)
          </button>

        </div>

        <div className="controls-hint">
          <h3>Controls</h3>
          <div className="controls-grid">
            <div><strong>Move:</strong> Arrow keys · Space attack · Shift defend</div>
          </div>
        </div>

        <div className="element-guide">
          <h3>Elements Cycle</h3>
          <p>Jin → Mu → Tu → Shui → Huo → Jin</p>
          <p className="hint">(each beats the next)</p>
        </div>
      </div>
    </div>
  )
}
