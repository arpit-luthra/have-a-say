// Decides, ONCE per page load, whether the intro splash plays.
// It plays only on the start page ("/"), once per browser session, and never for people who prefer reduced motion.
// It also tells the start page to wait for the splash before its own fade-up (via the --intro-delay CSS variable).
const KEY = 'headsup-splash-seen'

function wantsSplash() {
  try {
    if (window.location.pathname !== '/') return false // a shared link to a decision should open straight away
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (sessionStorage.getItem(KEY)) return false
    return true
  } catch {
    return false // storage blocked: skip it rather than show it on every visit
  }
}

export const SPLASH_WILL_SHOW = wantsSplash()
document.documentElement.style.setProperty('--intro-delay', SPLASH_WILL_SHOW ? '1.25s' : '0s')

export function markSplashSeen() {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // nothing to do: the splash just may play again next time
  }
}
