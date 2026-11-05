import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import '@fontsource/vt323/latin-400.css'
import '@fontsource/silkscreen/latin-400.css'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/rubik'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
