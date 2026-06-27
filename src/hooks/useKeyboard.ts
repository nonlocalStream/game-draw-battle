import { useEffect, useRef } from 'react'
import type { InputState } from '../game/player'

// P1: arrow keys to move, space to attack, shift to defend
const P1_KEYS = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  attack: [' '],
  defend: ['Shift'],
}

// P2 (local co-op): WASD
const P2_KEYS = {
  up: ['w', 'W'],
  down: ['s', 'S'],
  left: ['a', 'A'],
  right: ['d', 'D'],
  attack: ['z', 'Z'],
  defend: ['x', 'X'],
}

export function useKeyboard(player: 1 | 2 = 1): React.MutableRefObject<InputState> {
  const inputRef = useRef<InputState>({
    up: false, down: false, left: false, right: false,
    attack: false, defend: false
  })

  useEffect(() => {
    const keys = player === 1 ? P1_KEYS : P2_KEYS

    const onKeyDown = (e: KeyboardEvent) => {
      const input = inputRef.current
      if (keys.up.includes(e.key)) { input.up = true; e.preventDefault() }
      if (keys.down.includes(e.key)) { input.down = true; e.preventDefault() }
      if (keys.left.includes(e.key)) { input.left = true; e.preventDefault() }
      if (keys.right.includes(e.key)) { input.right = true; e.preventDefault() }
      if (keys.attack.includes(e.key)) { input.attack = true; e.preventDefault() }
      if (keys.defend.includes(e.key)) { input.defend = true }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const input = inputRef.current
      if (keys.up.includes(e.key)) input.up = false
      if (keys.down.includes(e.key)) input.down = false
      if (keys.left.includes(e.key)) input.left = false
      if (keys.right.includes(e.key)) input.right = false
      if (keys.attack.includes(e.key)) input.attack = false
      if (keys.defend.includes(e.key)) input.defend = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [player])

  return inputRef
}
