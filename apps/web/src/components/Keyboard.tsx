import {
  KEYBOARD_ROWS,
  FINGER_COLORS,
  lookupKey,
  type KeyDef,
} from '../data/keyboard'

interface Props {
  nextChar: string | null
  lastWrong?: string | null
  showColors?: boolean
}

function needsShift(char: string): boolean {
  if (char.length !== 1) return false
  if (char >= 'A' && char <= 'Z') return true
  return '~!@#$%^&*()_+{}|:"<>?'.includes(char)
}

export default function Keyboard({ nextChar, lastWrong, showColors = true }: Props) {
  const target = nextChar ? lookupKey(nextChar) : undefined
  const targetKey = target?.key
  const highlightShift = nextChar ? needsShift(nextChar) : false
  const isSpaceNext = nextChar === ' '

  const keyClass = (k: KeyDef): string => {
    const base =
      'relative flex items-center justify-center rounded-lg h-11 md:h-12 text-sm md:text-base font-bold select-none transition-all duration-150 border-b-4'
    const isNext =
      (targetKey !== undefined && k.key === targetKey) ||
      (isSpaceNext && k.key === ' ')
    const isShiftHint =
      highlightShift && (k.key === 'ShiftLeft' || k.key === 'ShiftRight')
    const isWrong = lastWrong !== undefined && lastWrong !== null && k.key === lastWrong

    if (isNext) {
      return `${base} scale-110 z-10 text-white border-ink bg-accent ring-4 ring-edge animate-pop shadow-lg`
    }
    if (isShiftHint) {
      return `${base} text-white border-ink bg-accent/80`
    }
    if (isWrong) {
      return `${base} bg-red-200 text-red-700 border-red-400 animate-shake`
    }
    return `${base} bg-white text-ink border-edge`
  }

  return (
    <div className="mx-auto w-full max-w-3xl select-none rounded-2xl bg-wash p-2 md:p-3 shadow-inner">
      {KEYBOARD_ROWS.map((row, ri) => (
        <div key={ri} className="mb-1.5 flex justify-center gap-1.5 last:mb-0">
          {row.map((k, ki) => {
            const color =
              showColors && k.isHome ? FINGER_COLORS[k.finger] : undefined
            const isNext =
              (targetKey !== undefined && k.key === targetKey) ||
              (isSpaceNext && k.key === ' ')
            return (
              <div
                key={ki}
                className={keyClass(k)}
                style={{
                  flex: `${k.width ?? 1} 1 0`,
                  minWidth: 0,
                  ...(color && !isNext
                    ? { boxShadow: `inset 0 -3px 0 ${color}` }
                    : {}),
                }}
              >
                {/* home-row finger dot */}
                {showColors && k.isHome && !isNext && (
                  <span
                    className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
                    style={{ background: FINGER_COLORS[k.finger] }}
                  />
                )}
                <span className="truncate px-1">{k.label}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
