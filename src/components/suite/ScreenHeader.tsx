import type { ReactNode } from 'react'
import { Button } from '../ui'

interface Props {
  title: string
  subtitle?: string
  onBack?: () => void
  backLabel?: string
  right?: ReactNode
}

export default function ScreenHeader({ title, subtitle, onBack, backLabel = '← Back', right }: Props) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold text-grape md:text-4xl">{title}</h1>
        {subtitle && <p className="font-bold text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {right}
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            {backLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
