import { useEffect, useRef } from 'react'

export function useGameLoop(callback: (dt: number) => void, active: boolean): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min(time - lastTimeRef.current, 50) : 16
      lastTimeRef.current = time
      callbackRef.current(dt)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])
}
