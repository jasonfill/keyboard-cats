// QWERTY layout + touch-typing finger assignments.
// Finger ids: L1..L4 = left pinky..index, R1..R4 = right index..pinky, T = thumb.

export type Finger =
  | 'L-pinky'
  | 'L-ring'
  | 'L-middle'
  | 'L-index'
  | 'R-index'
  | 'R-middle'
  | 'R-ring'
  | 'R-pinky'
  | 'thumb'

export interface KeyDef {
  key: string // the character produced (lowercase / symbol)
  label: string // what to show on the cap
  finger: Finger
  width?: number // relative width units (default 1)
  isHome?: boolean // resting position keys
}

export const FINGER_COLORS: Record<Finger, string> = {
  'L-pinky': '#f87171',
  'L-ring': '#fb923c',
  'L-middle': '#facc15',
  'L-index': '#4ade80',
  'R-index': '#22d3ee',
  'R-middle': '#60a5fa',
  'R-ring': '#a78bfa',
  'R-pinky': '#f472b6',
  thumb: '#94a3b8',
}

export const FINGER_LABELS: Record<Finger, string> = {
  'L-pinky': 'Left pinky',
  'L-ring': 'Left ring',
  'L-middle': 'Left middle',
  'L-index': 'Left index',
  'R-index': 'Right index',
  'R-middle': 'Right middle',
  'R-ring': 'Right ring',
  'R-pinky': 'Right pinky',
  thumb: 'Thumb',
}

export const KEYBOARD_ROWS: KeyDef[][] = [
  [
    { key: '`', label: '`', finger: 'L-pinky' },
    { key: '1', label: '1', finger: 'L-pinky' },
    { key: '2', label: '2', finger: 'L-ring' },
    { key: '3', label: '3', finger: 'L-middle' },
    { key: '4', label: '4', finger: 'L-index' },
    { key: '5', label: '5', finger: 'L-index' },
    { key: '6', label: '6', finger: 'R-index' },
    { key: '7', label: '7', finger: 'R-index' },
    { key: '8', label: '8', finger: 'R-middle' },
    { key: '9', label: '9', finger: 'R-ring' },
    { key: '0', label: '0', finger: 'R-pinky' },
    { key: '-', label: '-', finger: 'R-pinky' },
    { key: '=', label: '=', finger: 'R-pinky' },
    { key: 'Backspace', label: '⌫', finger: 'R-pinky', width: 2 },
  ],
  [
    { key: 'Tab', label: 'Tab', finger: 'L-pinky', width: 1.5 },
    { key: 'q', label: 'Q', finger: 'L-pinky' },
    { key: 'w', label: 'W', finger: 'L-ring' },
    { key: 'e', label: 'E', finger: 'L-middle' },
    { key: 'r', label: 'R', finger: 'L-index' },
    { key: 't', label: 'T', finger: 'L-index' },
    { key: 'y', label: 'Y', finger: 'R-index' },
    { key: 'u', label: 'U', finger: 'R-index' },
    { key: 'i', label: 'I', finger: 'R-middle' },
    { key: 'o', label: 'O', finger: 'R-ring' },
    { key: 'p', label: 'P', finger: 'R-pinky' },
    { key: '[', label: '[', finger: 'R-pinky' },
    { key: ']', label: ']', finger: 'R-pinky' },
    { key: '\\', label: '\\', finger: 'R-pinky', width: 1.5 },
  ],
  [
    { key: 'CapsLock', label: 'Caps', finger: 'L-pinky', width: 1.75 },
    { key: 'a', label: 'A', finger: 'L-pinky', isHome: true },
    { key: 's', label: 'S', finger: 'L-ring', isHome: true },
    { key: 'd', label: 'D', finger: 'L-middle', isHome: true },
    { key: 'f', label: 'F', finger: 'L-index', isHome: true },
    { key: 'g', label: 'G', finger: 'L-index' },
    { key: 'h', label: 'H', finger: 'R-index' },
    { key: 'j', label: 'J', finger: 'R-index', isHome: true },
    { key: 'k', label: 'K', finger: 'R-middle', isHome: true },
    { key: 'l', label: 'L', finger: 'R-ring', isHome: true },
    { key: ';', label: ';', finger: 'R-pinky', isHome: true },
    { key: "'", label: "'", finger: 'R-pinky' },
    { key: 'Enter', label: '⏎', finger: 'R-pinky', width: 2.25 },
  ],
  [
    { key: 'ShiftLeft', label: 'Shift', finger: 'L-pinky', width: 2.25 },
    { key: 'z', label: 'Z', finger: 'L-pinky' },
    { key: 'x', label: 'X', finger: 'L-ring' },
    { key: 'c', label: 'C', finger: 'L-middle' },
    { key: 'v', label: 'V', finger: 'L-index' },
    { key: 'b', label: 'B', finger: 'L-index' },
    { key: 'n', label: 'N', finger: 'R-index' },
    { key: 'm', label: 'M', finger: 'R-index' },
    { key: ',', label: ',', finger: 'R-middle' },
    { key: '.', label: '.', finger: 'R-ring' },
    { key: '/', label: '/', finger: 'R-pinky' },
    { key: 'ShiftRight', label: 'Shift', finger: 'R-pinky', width: 2.75 },
  ],
  [{ key: ' ', label: 'space', finger: 'thumb', width: 12 }],
]

// Fast lookup: character -> KeyDef (only for real typed characters).
const map = new Map<string, KeyDef>()
for (const row of KEYBOARD_ROWS) {
  for (const k of row) {
    if (k.key.length === 1) map.set(k.key, k)
  }
}

// Uppercase letters share their lowercase finger.
export function lookupKey(char: string): KeyDef | undefined {
  if (char.length !== 1) return undefined
  const lower = char.toLowerCase()
  return map.get(lower) ?? map.get(char)
}

export function fingerForChar(char: string): Finger | undefined {
  return lookupKey(char)?.finger
}
