export type Mood = 'happy' | 'excited' | 'sad' | 'neutral' | 'sleepy' | 'wow'

interface Props {
  mood?: Mood
  color?: string
  size?: number
  className?: string
}

// A friendly cat face drawn entirely in SVG so it's always available, crisp,
// and expressive. The eyes/mouth change with the mood.
export default function CatMascot({
  mood = 'neutral',
  color = '#f59e0b',
  size = 160,
  className = '',
}: Props) {
  const dark = '#3f2d1a'
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`cat feeling ${mood}`}
    >
      {/* ears */}
      <path d="M40 70 L55 20 L92 55 Z" fill={color} />
      <path d="M160 70 L145 20 L108 55 Z" fill={color} />
      <path d="M50 62 L58 34 L78 54 Z" fill="#fbcfe8" />
      <path d="M150 62 L142 34 L122 54 Z" fill="#fbcfe8" />
      {/* head */}
      <circle cx="100" cy="112" r="66" fill={color} />
      {/* stripes */}
      <path d="M100 46 q-8 12 0 24 q8 -12 0 -24" fill="#00000022" />
      <path d="M74 52 q-4 10 2 20" stroke="#00000018" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M126 52 q4 10 -2 20" stroke="#00000018" strokeWidth="5" fill="none" strokeLinecap="round" />

      {/* eyes */}
      {mood === 'sleepy' ? (
        <>
          <path d="M64 108 q14 10 28 0" stroke={dark} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M108 108 q14 10 28 0" stroke={dark} strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      ) : mood === 'sad' ? (
        <>
          <circle cx="78" cy="110" r="9" fill={dark} />
          <circle cx="122" cy="110" r="9" fill={dark} />
          <path d="M66 96 q12 -6 22 2" stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M134 96 q-12 -6 -22 2" stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="90" cy="120" r="4" fill="#7dd3fc" />
        </>
      ) : mood === 'happy' ? (
        <>
          <path d="M66 112 q12 -14 24 0" stroke={dark} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M110 112 q12 -14 24 0" stroke={dark} strokeWidth="6" fill="none" strokeLinecap="round" />
        </>
      ) : mood === 'wow' || mood === 'excited' ? (
        <>
          <circle cx="78" cy="108" r="13" fill="#fff" />
          <circle cx="122" cy="108" r="13" fill="#fff" />
          <circle cx="80" cy="110" r="8" fill={dark} />
          <circle cx="124" cy="110" r="8" fill={dark} />
          <circle cx="83" cy="107" r="2.5" fill="#fff" />
          <circle cx="127" cy="107" r="2.5" fill="#fff" />
        </>
      ) : (
        <>
          <circle cx="78" cy="110" r="10" fill={dark} />
          <circle cx="122" cy="110" r="10" fill={dark} />
          <circle cx="81" cy="107" r="3" fill="#fff" />
          <circle cx="125" cy="107" r="3" fill="#fff" />
        </>
      )}

      {/* nose */}
      <path d="M100 126 l-7 7 h14 z" fill="#ec4899" />

      {/* mouth */}
      {mood === 'sad' ? (
        <path d="M86 150 q14 -10 28 0" stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : mood === 'wow' ? (
        <ellipse cx="100" cy="150" rx="9" ry="11" fill={dark} />
      ) : mood === 'sleepy' ? (
        <path d="M92 146 q8 6 16 0" stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <path d="M100 133 v8" stroke={dark} strokeWidth="3" strokeLinecap="round" />
          <path d="M100 141 q-9 10 -18 2" stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M100 141 q9 10 18 2" stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* whiskers */}
      <g stroke={dark} strokeWidth="2.5" strokeLinecap="round" opacity="0.65">
        <line x1="60" y1="130" x2="22" y2="124" />
        <line x1="60" y1="138" x2="24" y2="142" />
        <line x1="140" y1="130" x2="178" y2="124" />
        <line x1="140" y1="138" x2="176" y2="142" />
      </g>

      {/* zzz for sleepy */}
      {mood === 'sleepy' && (
        <text x="150" y="60" fontSize="26" fill={dark} fontFamily="Outfit Variable, Outfit, sans-serif">
          z
        </text>
      )}
    </svg>
  )
}
