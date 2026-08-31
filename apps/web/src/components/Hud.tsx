interface Props {
  wpm: number
  accuracy: number
  combo: number
  progress: number // 0..1
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`text-2xl font-extrabold md:text-3xl ${color}`}>{value}</div>
      <div className="text-xs font-bold uppercase tracking-wide text-stone">{label}</div>
    </div>
  )
}

export default function Hud({ wpm, accuracy, combo, progress }: Props) {
  return (
    <div className="w-full rounded-2xl bg-white/85 p-4 shadow-lg ring-1 ring-hair">
      <div className="flex items-center justify-around">
        <Stat label="WPM" value={String(wpm)} color="text-ink" />
        <Stat label="Accuracy" value={`${accuracy}%`} color="text-pine" />
        <Stat
          label="Combo"
          value={combo > 0 ? `x${combo}` : '—'}
          color={combo >= 5 ? 'text-accent' : 'text-stone'}
        />
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-wash">
        <div
          className="h-full rounded-full bg-pine transition-all duration-200"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  )
}
