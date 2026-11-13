// Guess a topic from keywords in the title. This is a simple guess, not a fact:
// the first rule that matches wins, so the order matters. No match -> "Other".
const RULES = [
  ['Bike lanes', ['cycling', 'bike', 'bicycle']],
  ['Parking', ['parking']],
  ['Transit', ['ttc', 'transit', 'subway', 'streetcar', 'bus', 'light rail', 'lrt']],
  ['Housing', ['zoning', 'official plan', 'housing', 'rezoning', 'residential', 'tenant', 'condominium']],
  ['Parks & trees', ['park', 'tree', 'ravine', 'forest']],
  ['Taxes & budget', ['budget', 'tax', 'fees', 'levy', 'financial']],
  ['Heritage', ['heritage']],
  // Words like "street" or "avenue" are left out on purpose: they are just addresses.
  ['Roads & traffic', ['traffic', 'speed', 'intersection', 'sidewalk', 'road safety', 'vision zero', 'bridge']],
  ['Environment', ['climate', 'environment', 'waste', 'energy', 'green']],
  ['Safety', ['safety', 'police', 'fire', 'crime']],
  ['Business & licences', ['licen', 'business', 'bylaw', 'by-law']],
  ['Community services', ['community', 'shelter', 'library', 'recreation', 'child care', 'seniors']],
]

// A keyword matches when a word STARTS with it ("tree" matches "trees" but not "street").
export function guessTopic(title) {
  const text = title.toLowerCase()
  for (const [topic, words] of RULES) {
    if (words.some((w) => new RegExp('\\b' + w).test(text))) return topic
  }
  return 'Other'
}
