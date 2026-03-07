import React from 'react';
import UpgradeableAdminPanel from '../components/UpgradeableAdminPanel';
import { VERSION_LABEL } from '../utils/contractVersion';

export default function UpgradeableAdminPage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Upgradeable Admin ({VERSION_LABEL}) {mode === 'local' && '(Local Testing)'}</h2>
        <UpgradeableAdminPanel mode={mode} />
      </section>

      <aside className="card info">
        <h3>Upgradeable Contract Notes</h3>
        <ul>
          <li>Uses UUPS proxy pattern — always use the <strong>proxy address</strong></li>
          <li>V1: Core voting (create, vote, reveal, token allocation)</li>
          <li>V2 adds: categories, descriptions, vote weights, pause/unpause, deadline extension, emergency end, poll stats</li>
          <li>No secret ballot, quadratic, delegation, or gasless features</li>
          <li>Switch between V1/V2 via <code>REACT_APP_CONTRACT_VERSION</code> env var</li>
        </ul>
      </aside>
    </div>
  );
}
