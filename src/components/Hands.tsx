import { FINGER_COLORS, FINGER_LABELS, type Finger } from '../data/keyboard'

interface Props {
  activeFinger?: Finger | null
}

// Fingers are drawn left-to-right as pinky, ring, middle, index (index nearest
// the thumb). The right hand uses the same order and is mirrored via `flip`, so
// its index lands next to the thumb toward the center.
const LEFT: Finger[] = ['L-pinky', 'L-ring', 'L-middle', 'L-index']
const RIGHT: Finger[] = ['R-pinky', 'R-ring', 'R-middle', 'R-index']

// Relative finger heights (index/middle tallest) for a natural hand shape.
const HEIGHTS: Record<string, number> = {
  pinky: 34,
  ring: 46,
  middle: 52,
  index: 44,
}

function heightFor(f: Finger): number {
  const part = f.split('-')[1]
  return HEIGHTS[part] ?? 44
}

function Finger({
  finger,
  active,
  x,
}: {
  finger: Finger
  active: boolean
  x: number
}) {
  const h = heightFor(finger)
  const y = 60 - h
  return (
    <rect
      x={x}
      y={y}
      width={12}
      height={h + 14}
      rx={6}
      fill={active ? FINGER_COLORS[finger] : '#e5e7eb'}
      stroke={active ? '#111827' : '#d1d5db'}
      strokeWidth={active ? 2 : 1}
      className={active ? 'animate-pounce' : ''}
    />
  )
}

function Hand({
  fingers,
  active,
  thumbActive,
  flip,
}: {
  fingers: Finger[]
  active?: Finger | null
  thumbActive: boolean
  flip?: boolean
}) {
  return (
    <svg viewBox="0 0 90 100" width={110} height={122}>
      <g transform={flip ? 'translate(90,0) scale(-1,1)' : undefined}>
        {/* palm */}
        <rect x={8} y={62} width={70} height={30} rx={12} fill="#f3f4f6" stroke="#d1d5db" />
        {/* four fingers */}
        {fingers.map((f, i) => (
          <Finger key={f} finger={f} active={active === f} x={12 + i * 16} />
        ))}
        {/* thumb */}
        <rect
          x={62}
          y={70}
          width={22}
          height={12}
          rx={6}
          transform="rotate(24 62 70)"
          fill={thumbActive ? FINGER_COLORS.thumb : '#e5e7eb'}
          stroke={thumbActive ? '#111827' : '#d1d5db'}
          strokeWidth={thumbActive ? 2 : 1}
          className={thumbActive ? 'animate-pounce' : ''}
        />
      </g>
    </svg>
  )
}

export default function Hands({ activeFinger }: Props) {
  const thumb = activeFinger === 'thumb'
  const leftActive = activeFinger && LEFT.includes(activeFinger) ? activeFinger : null
  const rightActive = activeFinger && RIGHT.includes(activeFinger) ? activeFinger : null
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-end gap-4">
        <Hand fingers={LEFT} active={leftActive} thumbActive={thumb} />
        <Hand fingers={RIGHT} active={rightActive} thumbActive={thumb} flip />
      </div>
      <div className="h-6 text-center text-sm font-bold text-grape">
        {activeFinger ? `Use your ${FINGER_LABELS[activeFinger]}` : ' '}
      </div>
    </div>
  )
}
