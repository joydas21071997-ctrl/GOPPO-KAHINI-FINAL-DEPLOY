import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register Service Worker with aggressive auto-update checks on resume/focus
// so installed PWAs never stay stuck on stale app shells or cached configurations.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => {
      registration.update().catch(() => {});
    }, 5 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {});
      }
    });

    window.addEventListener('online', () => {
      registration.update().catch(() => {});
    });
  },
  onNeedRefresh() {
    void updateSW(true);
  },
});

createRoot(document.getElementById('root')!).render(<App />);
