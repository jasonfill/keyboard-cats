import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * `primary` is brand chrome — spark, on every surface including grown-up ones.
 * `play` is the themed CTA and belongs only on student play surfaces; it is a
 * separate variant rather than a flag so a progress report cannot accidentally
 * pick up a child's accent.
 */
type Variant = 'primary' | 'play' | 'secondary' | 'ghost' | 'danger' | 'success'

// The solid press: the shadow does not move, the button lifts on hover, so it
// reads as being pressed back down on click.
const variants: Record<Variant, string> = {
  primary:
    'bg-spark text-white shadow-[0_4px_0_#E14E12] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_2px_0_#E14E12]',
  play: 'bg-accent text-white shadow-[0_4px_0_rgb(var(--wz-accent-deep))] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_2px_0_rgb(var(--wz-accent-deep))]',
  secondary:
    'bg-ink text-white shadow-[0_4px_0_#000000] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_2px_0_#000000]',
  ghost: 'bg-chalk text-ink hover:bg-wash border-2 border-edge',
  danger:
    'bg-red-600 text-white shadow-[0_4px_0_#7f1d1d] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_2px_0_#7f1d1d]',
  success:
    'bg-pine text-white shadow-[0_4px_0_#12564B] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_2px_0_#12564B]',
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`rounded-xl px-6 py-3 font-sans text-lg font-extrabold transition-all disabled:opacity-40 disabled:shadow-none disabled:active:translate-y-0 ${variants[variant]} ${className}`}
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

// Cards are drawn with a 1px hair border rather than a shadow: the system has
// only two shadows, and neither of them is this.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-hair bg-chalk p-6 ${className}`}>{children}</div>
  )
}

export function Pill({
  children,
  className = '',
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-extrabold ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Space Grotesk, uppercase, wide tracking — the eyebrow label that sits above a
 * section or inside a stat card.
 */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-faint ${className}`}
    >
      {children}
    </div>
  )
}
