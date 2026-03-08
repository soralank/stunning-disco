import React from 'react';
import { Link } from 'react-router-dom';
import UpgradeableVoteList from '../components/UpgradeableVoteList';
import { VERSION_LABEL } from '../utils/contractVersion';

export default function UpgradeableVoterPage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Upgradeable Voter ({VERSION_LABEL}) {mode === 'local' && '(Local Testing)'}</h2>
        <UpgradeableVoteList mode={mode} />
      </section>

      <aside className="card info">
        <h3>How to vote (Upgradeable)</h3>
        {mode === 'local' ? (
          <ol>
            <li>Click an account button (Account #1–4 are voters)</li>
            <li>View polls you're authorized for</li>
            <li>Click "Show Candidates & Vote"</li>
            <li>Click "Vote" on your choice</li>
          </ol>
        ) : (
          <ol>
            <li>Connect MetaMask wallet</li>
            <li>View polls you're authorized for</li>
            <li>Click Vote on an option</li>
            <li>Confirm transaction in MetaMask</li>
          </ol>
        )}
        <div style={{ marginTop: 16 }}>
          <Link
            className="btn ghost"
            to={mode === 'local' ? '/local/upgradeable/results' : '/upgradeable/results'}
            style={{ textDecoration: 'none' }}
          >
            View Results Portal
          </Link>
        </div>
      </aside>
    </div>
  );
}
