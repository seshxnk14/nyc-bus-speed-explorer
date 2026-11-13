/** Prefer an installed local D3 bundle. A version-pinned CDN is the hosted fallback. */
import {LOCAL_D3} from './d3-config.js';

export async function loadD3() {
  if (globalThis.d3?.version === '7.9.0') return globalThis.d3;
  const sources = [...(LOCAL_D3 ? ['./vendor/d3.v7.min.js'] : []), 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'];
  for (const source of sources) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(() => { script.remove(); reject(new Error('D3 download timed out')); }, 15000);
        script.src = source;
        script.onload = () => { clearTimeout(timeout); resolve(); };
        script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('D3 source unavailable')); };
        document.head.append(script);
      });
      if (globalThis.d3?.version === '7.9.0') return globalThis.d3;
    } catch { /* Try the pinned distribution if a local bundle is not installed. */ }
  }
  throw new Error('D3.js could not be loaded. For local use, run npm install in the project folder, then npm start.');
}
