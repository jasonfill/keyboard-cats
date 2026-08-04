import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-grape text-white hover:bg-purple-700 shadow-[0_5px_0_#4c1d95] active:translate-y-0.5 active:shadow-[0_2px_0_#4c1d95]',
  secondary:
    'bg-sun text-white hover:bg-amber-500 shadow-[0_5px_0_#b45309] active:translate-y-0.5 active:shadow-[0_2px_0_#b45309]',
  ghost: 'bg-white/70 text-grape hover:bg-white border-2 border-purple-200',
  danger:
    'bg-red-500 text-white hover:bg-red-600 shadow-[0_5px_0_#991b1b] active:translate-y-0.5 active:shadow-[0_2px_0_#991b1b]',
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`rounded-2xl px-6 py-3 text-lg font-bold transition-all disabled:opacity-40 disabled:shadow-none disabled:active:translate-y-0 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function StarRow({ stars, size = 28 }: { stars: number; size?: number }) {
  return (
    <div className="flex gap-1" aria-label={`${stars} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{ fontSize: size }}
          className={i <= stars ? 'drop-shadow' : 'opacity-25 grayscale'}
        >
          ⭐
        </span>
      ))}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-white/85 p-6 shadow-xl ring-1 ring-purple-100 backdrop-blur ${className}`}>
      {children}
    </div>
  )
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${className}`}>
      {children}
    </span>
  )
}
