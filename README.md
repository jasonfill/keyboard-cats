# 🐱 Keyboard Cats — a gamified typing trainer for kids

A cat-themed React app that secretly teaches proper **touch typing** while a
6th grader thinks they're just playing a cat game. Learn the home row, unlock
new keys world-by-world, keep combos going, collect cat cards, and chase high
scores.

## Run it

Requires **Node 18+**.

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

To make a production build:

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```

No backend or accounts needed — all progress is saved in your browser
(`localStorage`).

## How the learning works (the pedagogy)

The "hidden learning" follows well-established typing instruction:

- **Home row first, then progressive key introduction.** You start on `F`/`J`
  (the bumps) and only unlock new keys after playing the previous lesson, so
  fingers build muscle memory without being overwhelmed.
- **Correct finger for every key.** An on-screen keyboard highlights the *next*
  key and a hand diagram shows *which finger* to use (color-coded), encouraging
  true touch typing instead of hunt-and-peck.
- **Accuracy before speed.** Stars and feedback reward accuracy first; WPM grows
  naturally. The lessons *block* on the correct key so kids learn precision.
- **Short, rewarding rounds** with instant feedback, which research shows beats
  long drills for young learners.

## What's inside (features)

- **5 worlds / 26 lessons** — Home Row Meadow → Treetop Tower → Burrow Basement
  → Sentence Savannah → Number Nook, each unlocking more of the keyboard.
- **Cat Rain** arcade mode — type falling cat-words to make kitties pounce before
  they hit the ground; 3 lives, rising difficulty, combos.
- **Free Practice** — pick "keys I've learned" or "all keys" and a length.
- **Gamification** — score, combo multipliers, 1–3 star ratings, high-score
  board, badges/achievements, and a **cat card collection** (real cat photos).
- **Live stats** — WPM, accuracy, and combo update as you type.
- **Sound effects** synthesized with the Web Audio API (no audio files), plus a
  settings screen to toggle sound, the on-screen keyboard, and the hand guide.
- **Cute animated cat mascot** that reacts to your typing (happy / excited /
  sad / wow), drawn in SVG so it always works offline.

## Tech

React 18 + TypeScript + Vite + Tailwind CSS. Cat photos come from a free image
service and gracefully fall back to the built-in SVG mascot if offline.

## Project layout

```
src/
  data/        keyboard layout + finger map, curriculum, word bank, achievements
  lib/         typing stats, content generator, sound synth, storage, cat photos
  hooks/       useTypingEngine (core engine), useGameState (persistence)
  components/  Keyboard, Hands, CatMascot, HUD, TypingText, ResultsCard, ...
  screens/     Home, WorldMap, Lesson, Practice, CatRain, TrophyRoom, Settings
```
