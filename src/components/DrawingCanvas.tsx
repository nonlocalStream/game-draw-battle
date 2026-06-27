import { useRef, useEffect, useState, useCallback } from 'react'

interface Props {
  onSubmit: (dataUrl: string) => void
}

const COLORS = ['#333333', '#E53935', '#1E88E5', '#43A047', '#F57F17', '#FF7043']

export function DrawingCanvas({ onSubmit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const [brushSize, setBrushSize] = useState(8)
  const [color, setColor] = useState(COLORS[0])
  const [eraser, setEraser] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Canvas starts transparent — no background fill

  const getPos = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: ((e as MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as MouseEvent).clientY - rect.top) * scaleY
    }
  }

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    drawing.current = true
    const pos = getPos(e)
    lastPos.current = pos
    const ctx = canvasRef.current!.getContext('2d')!
    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, brushSize * 1.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    } else {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }, [color, eraser, brushSize])

  const doDraw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pos = getPos(e)
    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = brushSize * 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    } else {
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = color
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    lastPos.current = pos
  }, [color, eraser, brushSize])

  const stopDraw = () => { drawing.current = false }

  const clearCanvas = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleSubmit = useCallback(() => {
    if (submitted) return
    setSubmitted(true)
    // PNG preserves transparency
    const dataUrl = canvasRef.current!.toDataURL('image/png')
    onSubmit(dataUrl)
  }, [submitted, onSubmit])

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', doDraw)
    canvas.addEventListener('mouseup', stopDraw)
    canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: true })
    canvas.addEventListener('touchmove', doDraw, { passive: true })
    canvas.addEventListener('touchend', stopDraw)
    return () => {
      canvas.removeEventListener('mousedown', startDraw)
      canvas.removeEventListener('mousemove', doDraw)
      canvas.removeEventListener('mouseup', stopDraw)
      canvas.removeEventListener('mouseleave', stopDraw)
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove', doDraw)
      canvas.removeEventListener('touchend', stopDraw)
    }
  }, [startDraw, doDraw])

  return (
    <div className="drawing-phase">
      <h2 className="phase-title">✏️ Draw Your Weapon!</h2>
      <p className="phase-subtitle">Draw anything — the AI will sense its element</p>

      <div className="drawing-layout">
        <div className="drawing-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="drawing-canvas"
            style={{ cursor: eraser ? 'cell' : 'crosshair' }}
          />
          <div className="drawing-transparent-hint">✦ Transparent background — only your strokes show in-game</div>
        </div>

        <div className="drawing-tools">
          <div className="tool-section">
            <label className="tool-label">Colors</label>
            <div className="color-grid">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`color-btn ${color === c && !eraser ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { setColor(c); setEraser(false) }}
                />
              ))}
            </div>
          </div>

          <div className="tool-section">
            <label className="tool-label">Size: {brushSize}px</label>
            <input
              type="range" min={2} max={20} value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="brush-slider"
            />
          </div>

          <button
            className={`tool-btn ${eraser ? 'active' : ''}`}
            onClick={() => setEraser(e => !e)}
          >
            {eraser ? '🖊️ Draw' : '🧹 Erase'}
          </button>

          <button className="tool-btn clear-btn" onClick={clearCanvas}>
            🗑️ Clear
          </button>

          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={submitted}
          >
            {submitted ? '✨ Analyzing...' : '⚔️ Done! Analyze'}
          </button>

          <p className="hint-text">Hint: sword, wave, flame, tree, rock...</p>
        </div>
      </div>
    </div>
  )
}
