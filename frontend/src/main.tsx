import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { playStartupSoundNow } from './lib/sounds'
import './index.css'

playStartupSoundNow()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
