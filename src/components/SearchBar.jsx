import React from 'react';

/**
 * Reusable search + filter chips bar.
 *
 * Props:
 *   searchTerm        – current search string
 *   onSearchChange    – (term) => void
 *   placeholder       – input placeholder text
 *   filters           – optional array of { id, label, active }
 *   onFilterToggle    – (id) => void
 *   children          – any extra controls to render on the right
 */
export default function SearchBar({
  searchTerm,
  onSearchChange,
  placeholder = 'Search…',
  filters,
  onFilterToggle,
  children
}) {
  return (
    <div className="search-bar">
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={searchTerm}
        onChange={e => onSearchChange(e.target.value)}
      />
      {filters && filters.length > 0 && (
        <div className="filter-chips">
          {filters.map(f => (
            <button
              key={f.id}
              className={`filter-chip ${f.active ? 'filter-chip--active' : ''}`}
              onClick={() => onFilterToggle(f.id)}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
