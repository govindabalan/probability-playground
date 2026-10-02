/**
 * Probability Playground — Application Entry Point
 * Bootstraps the game
 */

import { initUI } from './ui.js';

console.log('🎮 Probability Playground: app.js loaded');
window.__APP_LOADED = true;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 DOMContentLoaded, calling initUI');
    try {
      initUI();
      console.log('🎮 initUI completed successfully');
    } catch (e) {
      console.error('🎮 initUI ERROR:', e.message, e.stack);
    }
  });
} else {
  console.log('🎮 Document ready, calling initUI immediately');
  try {
    initUI();
    console.log('🎮 initUI completed successfully');
  } catch (e) {
    console.error('🎮 initUI ERROR:', e.message, e.stack);
  }
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // Unregister any existing SW to avoid stale cache issues
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// Handle install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Could show custom install button here
});

export async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
    }
  }
}