import { useMemo } from 'react'

const EMOJIS = ['🐱', '⭐', '🎉', '🐾', '💛', '✨', '🐟', '🧶']

// Lightweight CSS confetti — a burst of cat-themed emojis falling once.
export default function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1 + Math.random() * 1.2,
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
        size: 18 + Math.random() * 22,
      })),
    [count],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            fontSize: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}
