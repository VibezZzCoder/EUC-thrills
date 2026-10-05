/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LoadingScreen, loadingPaint } from '../ui/loadingScreen.ts';

// Keep this entry small. The branded HTML can paint while the game module
// downloads/parses; a rejected module import still has a usable retry surface.
const loading = new LoadingScreen();
document.dispatchEvent(new Event('euc-loader-ready'));
loading.begin('boot', 'Your next ride awaits', 'One wheel. Total freedom. Ride anywhere.');
loading.stage('Loading the game', 0, 9);
window.addEventListener('pagehide', () => loading.dispose(), { once: true });

async function boot(): Promise<void> {
  try {
    await loadingPaint();
    const [{ start }] = await Promise.all([import('./main.ts'), requiredStyles()]);
    await start(loading);
  } catch (error) {
    loading.fail('The game could not load. Check your connection and try again.', error);
  }
}

function requiredStyles(): Promise<void> {
  const link = document.getElementById('game-styles') as HTMLLinkElement;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      link.removeEventListener('load', loaded);
      link.removeEventListener('error', failed);
      if (error) reject(error);
      else { link.media = 'all'; resolve(); }
    };
    const loaded = (): void => finish();
    const failed = (): void => finish(new Error(`Required stylesheet failed: ${link.href}`));
    const timer = window.setTimeout(failed, 45_000);
    link.addEventListener('load', loaded);
    link.addEventListener('error', failed);
    if (link.dataset.failed === 'true') failed();
    else if (link.sheet || link.dataset.loaded === 'true') finish();
  });
}

void boot();
