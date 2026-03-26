import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mobile.css'
import { MobileApp } from './MobileApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
)
