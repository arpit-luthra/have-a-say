// Intro splash, 1.6 seconds in total:
//   0.0 - 0.7s  "Heads Up" types in, letter by letter, in the logo's navy
//   0.75s       the logo icon fades and scales in
//   1.15 - 1.6s the whole splash fades into the start page
// Click anywhere to skip. It never plays for people who prefer reduced motion (see lib/splashState.js).
import { useEffect, useRef, useState } from 'react'
import { SPLASH_WILL_SHOW, markSplashSeen } from '../lib/splashState.js'
import './Splash.css'

const WORD = 'Heads Up'
const TYPE_MS = 90

export default function Splash() {
  const [typed, setTyped] = useState(0) // how many letters are showing
  const [phase, setPhase] = useState('typing') // typing -> icon -> out
  const [gone, setGone] = useState(!SPLASH_WILL_SHOW)
  const timers = useRef([])

  useEffect(() => {
    if (!SPLASH_WILL_SHOW) return
    markSplashSeen()
    const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
    for (let i = 1; i <= WORD.length; i++) later(() => setTyped(i), i * TYPE_MS)
    later(() => setPhase('icon'), 760)
    later(() => setPhase('out'), 1150)
    later(() => setGone(true), 1600)
    return () => timers.current.forEach(clearTimeout)
  }, [])

  function skip() {
    timers.current.forEach(clearTimeout)
    setTyped(WORD.length)
    setPhase('out')
    timers.current = [setTimeout(() => setGone(true), 300)]
  }

  if (gone) return null
  return (
    <div className={`splash splash--${phase}`} onClick={skip} aria-hidden="true">
      <div className="splash__row">
        <img className="splash__icon" src="/logo-icon-256.png" alt="" width="96" height="96" />
        {/* The full word is always there (invisible) so the line doesn't shift as letters appear. */}
        <span className="splash__word">
          <span>{WORD.slice(0, typed)}</span>
          <span className="splash__ghost">{WORD.slice(typed)}</span>
        </span>
      </div>
    </div>
  )
}
