import React from 'react';

const ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];

/**
 * Reusable pagination + page-size selector.
 *
 * Props:
 *   totalItems   – total number of rows (post-filter)
 *   page         – current page (1-based)
 *   pageSize     – rows per page
 *   onPageChange – (newPage) => void
 *   onPageSizeChange – (newSize) => void   (optional)
 */
export default function Pagination({ totalItems, page, pageSize, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  // Build page number buttons – show up to 7 with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…l');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('…r');
    pages.push(totalPages);
  }

  return (
    <div className="pagination">
      <span>
        {totalItems === 0 ? 'No results' : `${from}–${to} of ${totalItems}`}
        {onPageSizeChange && (
          <select
            style={{ marginLeft: 8, font: 'inherit', fontSize: 12, border: '1px solid rgba(15,23,42,0.12)', borderRadius: 6, padding: '2px 4px' }}
            value={pageSize}
            onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          >
            {ROWS_PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
      </span>

      {totalPages > 1 && (
        <div className="pagination__controls">
          <button className="pagination__btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
          {pages.map((p, i) =>
            typeof p === 'string'
              ? <span key={p} style={{ padding: '0 4px', color: '#aaa' }}>…</span>
              : <button key={p} className={`pagination__btn ${page === p ? 'pagination__btn--active' : ''}`} onClick={() => onPageChange(p)}>{p}</button>
          )}
          <button className="pagination__btn" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}
