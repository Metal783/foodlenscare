import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
