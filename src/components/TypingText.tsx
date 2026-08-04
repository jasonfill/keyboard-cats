interface Props {
  target: string
  cursor: number
  hasError: boolean // current position was just mistyped
}

// Renders the text to type, character by character, so the learner always sees
// exactly where they are and what comes next.
export default function TypingText({ target, cursor, hasError }: Props) {
  return (
    <div className="rounded-2xl bg-white/90 p-5 md:p-7 shadow-inner ring-1 ring-purple-100">
      <p className="break-words font-mono text-2xl leading-relaxed tracking-wide md:text-3xl">
        {target.split('').map((ch, i) => {
          const isDone = i < cursor
          const isCurrent = i === cursor
          const display = ch === ' ' ? '␣' : ch

          let cls = 'text-slate-300'
          if (isDone) cls = 'text-emerald-500'
          if (isCurrent) {
            cls = hasError
              ? 'bg-red-400 text-white rounded animate-shake'
              : 'bg-grape text-white rounded ring-2 ring-purple-300'
          }
          return (
            <span
              key={i}
              className={`${cls} ${ch === ' ' && !isCurrent ? 'text-slate-200' : ''} px-0.5`}
            >
              {display}
            </span>
          )
        })}
      </p>
    </div>
  )
}
