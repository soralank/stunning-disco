import React from 'react';
import AdminPanel from '../components/AdminPanel';

export default function FranchiseePage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Franchisee Panel {mode === 'local' && '(Local Testing)'}</h2>
        <AdminPanel mode={mode} role="franchisee" />
      </section>

      <aside className="card info">
        <h3>{mode === 'local' ? 'Local Testing Guide' : 'Franchisee Notes'}</h3>
        {mode === 'local' ? (
          <ul>
            <li>Click an account button to connect</li>
            <li>Connect as a franchisee account (granted by owner)</li>
            <li>Create polls, add candidates, authorize voters</li>
            <li>Manage poll settings and metadata</li>
            <li>No MetaMask needed!</li>
          </ul>
        ) : (
          <ul>
            <li>Connect your MetaMask wallet</li>
            <li>You must have an active franchise granted by the owner</li>
            <li>Create polls within your franchise allocation</li>
            <li>Add candidates and authorize voters</li>
            <li>Configure voting modes and poll settings</li>
          </ul>
        )}
      </aside>
    </div>
  );
}
