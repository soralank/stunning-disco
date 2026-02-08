import React from 'react';
import ResultsList from '../components/ResultsList';

export default function ResultsPage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Election Results {mode === 'local' && '(Local Testing)'}</h2>
        <ResultsList mode={mode} />
      </section>

      <aside className="card info">
        <h3>Results Portal</h3>
        <ul>
          <li>Shows only ended and revealed polls</li>
          <li>Voters do not see active polls here</li>
          <li>Admins reveal results after voting ends</li>
        </ul>
      </aside>
    </div>
  );
}
