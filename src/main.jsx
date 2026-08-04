import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './GBC_LIMS.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
