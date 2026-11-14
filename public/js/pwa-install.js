(() => {
  const DISMISS_KEY = 'marrocos-pos-install-dismissed';
  let deferredPrompt = null;

  const banner = document.getElementById('mpInstallBanner');
  const installButton = document.getElementById('mpInstallButton');
  const dismissButton = document.getElementById('mpInstallDismiss');
  if (!banner || !installButton || !dismissButton) return;

  const showBanner = () => {
    if (window.matchMedia('(display-mode: standalone)').matches || localStorage.getItem(DISMISS_KEY)) return;
    banner.hidden = false;
    banner.classList.add('is-visible');
    document.body.classList.add('mp-install-visible');
  };

  const hideBanner = () => {
    banner.classList.remove('is-visible');
    banner.hidden = true;
    document.body.classList.remove('mp-install-visible');
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.disabled = false;
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
  });

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
      installButton.textContent = 'Usa el menú';
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideBanner();
  });

  dismissButton.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    hideBanner();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  window.setTimeout(showBanner, 700);
})();
