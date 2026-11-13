// A dropdown button with checkboxes ("Topic ▾"). Uses the browser's built-in <details>,
// which already works with the keyboard and screen readers.
import { useEffect, useRef } from 'react'
import './FilterBar.css'

export default function MultiSelect({ label, options, selected, onChange, single = false }) {
  const ref = useRef(null)

  // Close when you click anywhere outside.
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && ref.current.removeAttribute('open')
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  function toggle(option) {
    if (single) {
      onChange([option])
      ref.current.removeAttribute('open')
    } else {
      onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option])
    }
  }

  const text = single ? selected[0] : selected.length ? `${label} · ${selected.length}` : label

  return (
    <details className="select" ref={ref}>
      <summary className={`select__button ${!single && selected.length ? 'select__button--on' : ''}`}>
        {text} ▾
      </summary>
      <div className="select__menu">
        {options.map((option) => (
          <label key={option} className="select__option">
            <input
              type={single ? 'radio' : 'checkbox'}
              name={single ? label : undefined}
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </details>
  )
}
