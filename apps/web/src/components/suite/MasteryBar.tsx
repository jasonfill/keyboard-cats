interface Props {
  mastered: number
  practiced: number
  learning: number
  total: number
  className?: string
}

/**
 * One bar showing how a set of words breaks down by mastery band. Used on the
 * spelling home screen and the progress dashboard so both read the same way.
 */
export default function MasteryBar({ mastered, practiced, learning, total, className = '' }: Props) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-tray">
        <div className="bg-pine transition-all" style={{ width: `${pct(mastered)}%` }} />
        <div className="bg-pineSoft transition-all" style={{ width: `${pct(practiced)}%` }} />
        <div className="bg-sun transition-all" style={{ width: `${pct(learning)}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-[13px] font-bold text-muted">
        <Legend color="bg-pine" label="Mastered" value={mastered} />
        <Legend color="bg-pineSoft" label="Practiced" value={practiced} />
        <Legend color="bg-sun" label="Learning" value={learning} />
        <Legend color="bg-tray" label="Not yet seen" value={total - mastered - practiced - learning} />
      </div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label} {value}
    </span>
  )
}
