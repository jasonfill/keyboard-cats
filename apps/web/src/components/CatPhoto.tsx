import { useState } from 'react'
import { catPhotoUrl } from '../lib/cats'
import Mascot from './Mascot'

interface Props {
  seed: string
  className?: string
  rounded?: string
}

// Real cat photo with a graceful fallback to the SVG mascot if the network
// (or the photo service) is unavailable — so the game never shows a broken image.
export default function CatPhoto({ seed, className = '', rounded = 'rounded-2xl' }: Props) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-amber-100 ${rounded} ${className}`}>
        <Mascot mood="idle" size={96} />
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden bg-amber-100 ${rounded} ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Mascot mood="resting" size={72} className="animate-floaty" />
        </div>
      )}
      <img
        src={catPhotoUrl(seed)}
        alt="a cat"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
