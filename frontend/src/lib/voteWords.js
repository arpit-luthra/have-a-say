// Plain words for votes and decision-making bodies, shared by cards and pages.

/** "Carried, 25-1" -> "Approved". "Lost, 9-15" -> "Rejected". The numbers are dropped on purpose. */
export function outcomeWord(result) {
  return result.startsWith('Lost') ? 'Rejected' : 'Approved'
}

/** City Council stays; the TTC becomes "TTC board"; every other committee is "City committee". */
export function bodyName(committee) {
  if (committee === 'City Council') return 'City Council'
  if (committee === 'Toronto Transit Commission') return 'TTC board'
  return 'City committee'
}
