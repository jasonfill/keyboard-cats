// Standard typing metrics. WPM uses the convention that a "word" = 5 chars.
export function computeWpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  const minutes = elapsedMs / 60000
  if (minutes <= 0) return 0
  return Math.round(correctChars / 5 / minutes)
}

export function computeAccuracy(correct: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((correct / total) * 100)
}

export interface RoundResult {
  wpm: number
  accuracy: number
  correct: number
  incorrect: number
  totalTyped: number
  elapsedMs: number
  maxCombo: number
  score: number
}

// Stars reward accuracy first (pedagogy: accuracy before speed), with a small
// speed bonus so kids feel progress as they get quicker.
export function starRating(accuracy: number, wpm: number): 1 | 2 | 3 {
  if (accuracy >= 95 && wpm >= 18) return 3
  if (accuracy >= 90 && wpm >= 10) return 3
  if (accuracy >= 85) return 2
  if (accuracy >= 70) return 2
  return 1
}

// Score blends accuracy, speed, and the best combo streak.
export function computeScore(
  correct: number,
  accuracy: number,
  wpm: number,
  maxCombo: number,
): number {
  const base = correct * 10
  const accBonus = Math.round((accuracy / 100) * correct * 5)
  const speedBonus = wpm * 8
  const comboBonus = maxCombo * 15
  return base + accBonus + speedBonus + comboBonus
}

// Encouraging, age-appropriate feedback line.
export function feedbackLine(accuracy: number): string {
  if (accuracy >= 98) return 'Near-perfect accuracy. You are a typing wizard! 🧙'
  if (accuracy >= 95) return 'Amazing — you barely missed a key!'
  if (accuracy >= 90) return 'Great job! So smooth and steady! ✨'
  if (accuracy >= 80) return 'Nice work! Slow down a touch for even better aim. 🎯'
  if (accuracy >= 65) return 'Good effort! Focus on hitting the right keys. 💪'
  return 'Keep going! Accuracy first, speed will follow. 🐱'
}
