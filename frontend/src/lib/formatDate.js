// "2026-08-05" -> "Aug 5, 2026". Uses UTC so the day never shifts with the time zone.
export function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}
