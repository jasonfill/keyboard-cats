import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the static bundle carries its own type and the app never
// waits on a font CDN. Variable faces cover the whole weight range the brand
// uses (Outfit 800/900, Nunito 400/800, Space Grotesk 700).
import '@fontsource-variable/outfit'
import '@fontsource-variable/nunito'
import '@fontsource-variable/space-grotesk'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
