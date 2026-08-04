import { useMemo } from 'react'

// Soft gradient sky with lazily-floating paw prints for a playful backdrop.
export default function Background() {
  const paws = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 20 + Math.random() * 40,
        delay: Math.random() * 3,
        rot: Math.random() * 360,
      })),
    [],
  )
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-purple-100 via-cream to-amber-100">
      {paws.map((p) => (
        <span
          key={p.id}
          className="absolute animate-floaty opacity-20"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            fontSize: p.size,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: `${p.delay}s`,
          }}
        >
          🐾
        </span>
      ))}
    </div>
  )
}
