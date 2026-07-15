import { useRef, useEffect } from 'react'
import type { InputState } from '../game/player'

interface Props {
  inputRef: React.MutableRefObject<InputState>
}

export function MobileControls({ inputRef }: Props) {
  const dpadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = dpadRef.current
    if (!el) return

    const applyTouches = (touches: TouchList) => {
      const input = inputRef.current
      input.up = input.down = input.left = input.right = false

      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dead = rect.width * 0.2

      for (let i = 0; i < touches.length; i++) {
        const t = touches[i]
        if (t.clientX < rect.left || t.clientX > rect.right ||
            t.clientY < rect.top  || t.clientY > rect.bottom) continue
        const dx = t.clientX - cx
        const dy = t.clientY - cy
        if (Math.hypot(dx, dy) < dead) continue
        if (Math.abs(dx) > Math.abs(dy) * 0.5) input[dx > 0 ? 'right' : 'left'] = true
        if (Math.abs(dy) > Math.abs(dx) * 0.5) input[dy > 0 ? 'down' : 'up'] = true
      }
    }

    const onTouch = (e: TouchEvent) => { e.preventDefault(); applyTouches(e.touches) }
    const onEnd   = (e: TouchEvent) => { e.preventDefault(); applyTouches(e.touches) }

    el.addEventListener('touchstart',  onTouch, { passive: false })
    el.addEventListener('touchmove',   onTouch, { passive: false })
    el.addEventListener('touchend',    onEnd,   { passive: false })
    el.addEventListener('touchcancel', onEnd,   { passive: false })
    return () => {
      el.removeEventListener('touchstart',  onTouch)
      el.removeEventListener('touchmove',   onTouch)
      el.removeEventListener('touchend',    onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [inputRef])

  const btn = (key: 'attack' | 'defend') => ({
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); inputRef.current[key] = true  },
    onTouchEnd:   (e: React.TouchEvent) => { e.preventDefault(); inputRef.current[key] = false },
    onTouchCancel:(e: React.TouchEvent) => { e.preventDefault(); inputRef.current[key] = false },
  })

  return (
    <div className="mobile-controls">
      {/* D-pad left */}
      <div className="dpad" ref={dpadRef}>
        <span className="dpad-arr dpad-u">▲</span>
        <span className="dpad-arr dpad-d">▼</span>
        <span className="dpad-arr dpad-l">◀</span>
        <span className="dpad-arr dpad-r">▶</span>
        <span className="dpad-dot" />
      </div>

      {/* A / B buttons right */}
      <div className="action-btns">
        <button className="action-btn btn-b" {...btn('defend')}>
          <span className="btn-letter">B</span>
          <span className="btn-sub">def</span>
        </button>
        <button className="action-btn btn-a" {...btn('attack')}>
          <span className="btn-letter">A</span>
          <span className="btn-sub">atk</span>
        </button>
      </div>
    </div>
  )
}
