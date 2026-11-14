// One general sentence or two per topic, shown under the plain title on the decision page.
// Written to be true for EVERY decision of that type, so they never claim facts about one item.
const BLURBS = {
  Housing:
    'This is about homes or buildings where people live: what can be built, where, or how it is run. The City makes these choices by following local planning rules.',
  Heritage:
    'This is about a building or place the City considers part of Toronto\'s history. The City decides how it should be looked after.',
  'Bike lanes':
    'This is about getting around by bike or scooter, such as bike lanes or the rules for using them. It can change how a street is shared.',
  'Roads & traffic':
    'This is about how a street or road works for people driving, walking or cycling. It can change things like traffic, speeds or crossings.',
  Transit:
    'This is about buses, streetcars, subways or other public transit. It can change how people get around the city.',
  Parking:
    'This is about where and how people can park. It can change the rules or the spots on a street or in a lot.',
  'Parks & trees':
    'This is about parks, trees or green spaces that the City looks after for everyone to use.',
  'Taxes & budget':
    'This is about how the City collects and spends money, such as taxes, fees or budgets.',
  Safety:
    'This is about keeping people safe, such as police, fire or emergency services.',
  'Community services':
    'This is about services that help people in their neighbourhood, such as libraries, shelters, recreation or child care.',
  Environment:
    'This is about protecting the environment, such as climate, energy or waste.',
  'Business & licences':
    'This is about the rules for running a business in Toronto, including licences and what businesses are allowed to do.',
  Other:
    'This is a decision made by the City. The official page has the full details.',
}

export function topicBlurb(topic) {
  return BLURBS[topic] ?? BLURBS.Other
}
