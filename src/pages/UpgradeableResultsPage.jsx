import React from 'react';
import UpgradeableResultsList from '../components/UpgradeableResultsList';
import { VERSION_LABEL } from '../utils/contractVersion';

export default function UpgradeableResultsPage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Upgradeable Results ({VERSION_LABEL}) {mode === 'local' && '(Local Testing)'}</h2>
        <UpgradeableResultsList mode={mode} />
      </section>

      <aside className="card info">
        <h3>Results Portal</h3>
        <ul>
          <li>Shows only ended and revealed polls</li>
          <li>Admins reveal results after voting ends</li>
          <li>V2 shows extra info: categories, descriptions, participation rate, vote diversity</li>
        </ul>
      </aside>
    </div>
  );
}
