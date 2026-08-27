// Cat photos are fetched from a free service (deterministic per seed) so we get
// real cat pictures without bundling large assets. If the network is
// unavailable, components fall back to the always-present local SVG mascot.

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

// loremflickr serves deterministic images when given a "lock" number.
export function catPhotoUrl(seed: string, w = 400, h = 300): string {
  const lock = (hashSeed(seed) % 5000) + 1
  return `https://loremflickr.com/${w}/${h}/kitten,cat?lock=${lock}`
}

// A second source for variety / fallback (also cats).
export function catPhotoUrlAlt(seed: string, w = 400, h = 300): string {
  const n = (hashSeed(seed + 'alt') % 1000) + 1
  return `https://placekitten.com/${w}/${h}?image=${(n % 16) + 1}`
}

export const CAT_FACTS: string[] = [
  'Cats have five toes on their front paws but only four on the back!',
  'A group of cats is called a "clowder."',
  'Cats spend about 70% of their lives sleeping.',
  'A cat can rotate its ears 180 degrees.',
  'Cats can make over 100 different sounds.',
  'A cat’s nose print is unique, just like a human fingerprint.',
  'Cats walk like camels and giraffes: both right feet, then both left.',
  'The oldest known pet cat existed 9,500 years ago.',
  'Cats can jump up to six times their length.',
  'A cat’s purr may help heal bones and muscles.',
  'Isaac Newton is credited with inventing the cat door.',
  'Cats have a special collarbone that lets them always land on their feet.',
]

export function randomCatFact(): string {
  return CAT_FACTS[Math.floor(Math.random() * CAT_FACTS.length)]
}
