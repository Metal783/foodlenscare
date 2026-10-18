import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initializeMobile, isMobileApp } from './mobile'
import { App as NativeApp } from '@capacitor/app'

if (!isMobileApp() && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}

async function mount() {
  try { await initializeMobile(); } catch { /* 欢迎页仍提供地址设置用于恢复。 */ }
  if (isMobileApp()) {
    await NativeApp.addListener('backButton', () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label^="返回"]')).filter(button => button.getBoundingClientRect().height > 0 && !button.disabled);
      if (buttons.length) buttons[buttons.length - 1].click();
      else if (window.history.state?.foodlensView && window.history.state.foodlensView !== 'welcome') window.history.back();
      else void NativeApp.minimizeApp();
    });
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
}
void mount();
