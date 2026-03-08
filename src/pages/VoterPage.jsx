import React from 'react';
import { Link } from 'react-router-dom';
import VoteList from '../components/VoteList';

export default function VoterPage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Available Votes {mode === 'local' && '(Local Testing)'}</h2>
        <VoteList mode={mode} />
      </section>

      <aside className="card info">
        <h3>How to vote</h3>
        {mode === 'local' ? (
          <ol>
            <li>Click an account button (Account #0, #1, #2, #3, or #4)</li>
            <li>View polls you're authorized for</li>
            <li>Click "Show Candidates & Vote"</li>
            <li>Click "Vote" on your choice</li>
            <li>No MetaMask needed!</li>
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
            to={mode === 'local' ? '/local/results' : '/results'}
            style={{ textDecoration: 'none' }}
          >
            View Results Portal
          </Link>
        </div>
      </aside>
    </div>
  );
}
