// The row of filter buttons under the search box, plus the "2 decisions" count.
import MultiSelect from './MultiSelect.jsx'
import { TOPICS, STAGES, SAY_OPTIONS, SORTS } from '../lib/filterDecisions.js'
import './FilterBar.css'

export const NO_FILTERS = { topics: [], stages: [], says: [], sort: 'Newest', status: 'All' }

export default function FilterBar({ filters, onChange, count }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value })
  const isFiltered = filters.topics.length || filters.stages.length || filters.says.length

  return (
    <div className="filters">
      <MultiSelect label="Topic" options={TOPICS} selected={filters.topics} onChange={set('topics')} />
      <MultiSelect label="Stage" options={STAGES} selected={filters.stages} onChange={set('stages')} />
      <MultiSelect label="Can I have a say?" options={SAY_OPTIONS} selected={filters.says} onChange={set('says')} />
      <MultiSelect label="Sort" single options={SORTS} selected={[filters.sort]} onChange={(v) => set('sort')(v[0])} />
      <p className="filters__count" aria-live="polite">
        {count} {count === 1 ? 'decision' : 'decisions'}
        {isFiltered ? (
          <button className="filters__clear" type="button" onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort, status: filters.status })}>
            Clear filters
          </button>
        ) : null}
      </p>
    </div>
  )
}
