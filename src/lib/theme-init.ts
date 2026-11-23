/**
 * Theme bootstrap script and its exact CSP hash.
 *
 * The script is inlined in the document head so the correct theme is applied
 * before paint. Because browsers hide a nonce attribute after parsing, passing
 * a nonce prop to React causes a spurious hydration mismatch. Its content is
 * fixed, so a CSP hash is the stable way to allow it.
 *
 * If THEME_INIT_SCRIPT changes, recompute THEME_INIT_SCRIPT_HASH with:
 *   node -e "const s=require('fs').readFileSync('src/lib/theme-init.ts','utf8').match(/const THEME_INIT_SCRIPT = `([\\s\\S]*?)`;/)[1]; console.log('sha256-'+require('crypto').createHash('sha256').update(s).digest('base64'))"
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ep-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export const THEME_INIT_SCRIPT_HASH = 'sha256-rymHDGCqZnF1ruucIdWvhXVvyuJiO3jNpUJyW3Dvv0Y=';
