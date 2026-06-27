import type { WeaponData } from '../types'
import { ELEMENT_STATS, ELEMENT_COLORS } from '../game/elements'

interface Props {
  weapon: WeaponData
  label?: string
}

export function WeaponDisplay({ weapon, label }: Props) {
  const stats = ELEMENT_STATS[weapon.element]
  const colors = ELEMENT_COLORS[weapon.element]

  return (
    <div
      className="weapon-card"
      style={{
        background: colors.bg,
        border: `3px solid ${colors.border}`,
      }}
    >
      {label && <p className="weapon-card-label">{label}</p>}

      <div className="weapon-card-header">
        <span className="element-emoji">{stats.emoji}</span>
        <div>
          <div className="weapon-name">{weapon.weaponName}</div>
          <div className="element-badge" style={{ color: colors.text, borderColor: colors.border }}>
            {stats.chineseName} · {stats.label}
          </div>
        </div>
      </div>

      {weapon.drawingDataUrl && (
        <img
          src={weapon.drawingDataUrl}
          alt="Your drawing"
          className="weapon-drawing"
        />
      )}

      <p className="weapon-description">"{weapon.description}"</p>

      <div className="weapon-stats">
        <div className="stat-row">
          <span>⚔️ {weapon.isMelee ? 'Melee' : 'Ranged'}</span>
          <span>❤️ {stats.hp} HP</span>
          <span>💨 Spd {stats.speed}</span>
        </div>
        <div className="stat-row">
          <span>🗡️ Atk {stats.atkDmg}</span>
          <span>🛡️ Def {Math.round((1 - stats.defMult) * 100)}%</span>
        </div>
      </div>

      <div className="element-description">{stats.description}</div>
    </div>
  )
}
