import { useState, useEffect } from 'react'
import type { SavedWeapon, WeaponData } from '../types'
import { ELEMENT_STATS, ELEMENT_COLORS } from '../game/elements'

interface Props {
  onSelect: (weapon: WeaponData) => void
  onClose: () => void
}

export function Gallery({ onSelect, onClose }: Props) {
  const [weapons, setWeapons] = useState<SavedWeapon[]>([])
  const [detail, setDetail] = useState<SavedWeapon | null>(null)
  const [showLv2, setShowLv2] = useState(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('draw-battle-gallery') ?? '[]') as SavedWeapon[]
      setWeapons(saved.sort((a, b) => b.savedAt - a.savedAt))
    } catch { setWeapons([]) }
  }, [])

  const deleteWeapon = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = weapons.filter(w => w.id !== id)
    setWeapons(updated)
    localStorage.setItem('draw-battle-gallery', JSON.stringify(updated))
  }

  const openDetail = (w: SavedWeapon) => {
    setDetail(w)
    setShowLv2(false)
  }

  return (
    <>
      <div className="gallery-overlay">
        <div className="gallery-panel">
          <div className="gallery-header">
            <h2 className="gallery-title">⚔️ Weapon Gallery</h2>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>

          {weapons.length === 0 ? (
            <div className="gallery-empty">
              <p>No weapons yet! Draw something to save it here.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {weapons.map(w => {
                const stats = ELEMENT_STATS[w.element]
                const colors = ELEMENT_COLORS[w.element]
                return (
                  <div
                    key={w.id}
                    className="gallery-item"
                    style={{ border: `2px solid ${colors.border}`, background: colors.bg, cursor: 'pointer' }}
                    onClick={() => openDetail(w)}
                  >
                    <div className="gallery-thumb-wrap">
                      <img src={w.drawingDataUrl} alt={w.weaponName} className="gallery-drawing" />
                      {w.upgrade && (
                        <span className="gallery-star-badge">★</span>
                      )}
                    </div>
                    <div className="gallery-info">
                      <div className="gallery-element" style={{ color: colors.text }}>
                        {stats.emoji} {stats.chineseName}
                      </div>
                      <div className="gallery-weapon-name">{w.weaponName}</div>
                      <div className="gallery-type">{w.isMelee ? '🗡️ Melee' : '🏹 Ranged'}</div>
                    </div>
                    <div className="gallery-actions">
                      <button
                        className="use-btn"
                        style={{ borderColor: colors.border, color: colors.text }}
                        onClick={e => { e.stopPropagation(); onSelect(w) }}
                      >
                        Use
                      </button>
                      <button className="del-btn" onClick={e => deleteWeapon(w.id, e)}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {detail && (
        <WeaponDetailModal
          weapon={detail}
          showLv2={showLv2}
          onToggleLevel={() => setShowLv2(v => !v)}
          onUse={() => { onSelect(detail); setDetail(null) }}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}

function WeaponDetailModal({
  weapon, showLv2, onToggleLevel, onUse, onClose
}: {
  weapon: SavedWeapon
  showLv2: boolean
  onToggleLevel: () => void
  onUse: () => void
  onClose: () => void
}) {
  const stats = ELEMENT_STATS[weapon.element]
  const colors = ELEMENT_COLORS[weapon.element]
  const hasUpgrade = !!weapon.upgrade

  const displayName = showLv2 && weapon.upgrade ? weapon.upgrade.weaponName : weapon.weaponName
  const displayDesc = showLv2 && weapon.upgrade ? weapon.upgrade.description : weapon.description

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal"
        style={{ border: `3px solid ${colors.border}`, background: colors.bg }}
        onClick={e => e.stopPropagation()}
      >
        <button className="close-btn detail-close" onClick={onClose}>✕</button>

        <div className="detail-header">
          <span className="detail-emoji">{stats.emoji}</span>
          <div>
            <div className="detail-element" style={{ color: colors.text }}>
              {stats.chineseName} · {stats.label}
            </div>
            <div className="detail-name">
              {displayName}
              {showLv2 && hasUpgrade && <span className="lv2-tag">★ Lv.2</span>}
              {!showLv2 && <span className="lv1-tag">Lv.1</span>}
            </div>
          </div>
        </div>

        <img src={weapon.drawingDataUrl} alt={weapon.weaponName} className="detail-drawing" />

        <p className="detail-desc">"{displayDesc}"</p>

        <div className="detail-stats">
          <span>{weapon.isMelee ? '🗡️ Melee' : '🏹 Ranged'}</span>
          <span>❤️ {stats.hp} HP</span>
          <span>⚔️ {stats.atkDmg}{showLv2 && hasUpgrade ? <strong> +20%</strong> : ''}</span>
          <span>🛡️ Def {Math.round((1 - stats.defMult) * 100)}%</span>
        </div>

        <div className="detail-actions">
          {hasUpgrade && (
            <button
              className="level-toggle-btn"
              style={{ borderColor: colors.border, color: colors.text }}
              onClick={onToggleLevel}
            >
              {showLv2 ? '← Lv.1' : 'Lv.2 ★ →'}
            </button>
          )}
          <button className="lobby-btn primary detail-use-btn" onClick={onUse}>
            ⚔️ Use This Weapon
          </button>
        </div>
      </div>
    </div>
  )
}

export function saveWeaponToGallery(weapon: WeaponData & { id?: string }): void {
  try {
    const existing = JSON.parse(localStorage.getItem('draw-battle-gallery') ?? '[]') as SavedWeapon[]
    const newEntry: SavedWeapon = { ...weapon, id: weapon.id ?? `w_${Date.now()}`, savedAt: Date.now() }
    localStorage.setItem('draw-battle-gallery', JSON.stringify([newEntry, ...existing].slice(0, 20)))
  } catch { /* localStorage unavailable */ }
}

export function applyUpgradeToGallery(weaponId: string, upgrade: { weaponName: string; description: string }): void {
  try {
    const existing = JSON.parse(localStorage.getItem('draw-battle-gallery') ?? '[]') as SavedWeapon[]
    const updated = existing.map(w => w.id === weaponId ? { ...w, upgrade } : w)
    localStorage.setItem('draw-battle-gallery', JSON.stringify(updated))
  } catch { /* localStorage unavailable */ }
}
