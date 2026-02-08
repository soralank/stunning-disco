import React from 'react';
import AdminPanel from '../components/AdminPanel';

export default function AdminPage({ mode = 'production' }) {
  return (
    <div className="page-grid">
      <section className="card">
        <h2>Admin Controls {mode === 'local' && '(Local Testing)'}</h2>
        <AdminPanel mode={mode} />
      </section>

      <aside className="card info">
        <h3>{mode === 'local' ? 'Local Testing Guide' : 'Admin Notes'}</h3>
        {mode === 'local' ? (
          <ul>
            <li>Click an account button to connect instantly</li>
            <li>Account #0 is the contract owner</li>
            <li>Create polls, add candidates, authorize voters</li>
            <li>Use "Copy Test Voter Addresses" for quick setup</li>
            <li>No MetaMask needed!</li>
          </ul>
        ) : (
          <ul>
            <li>Connect your MetaMask wallet</li>
            <li>Only contract owner can create polls</li>
            <li>Admin can manage assigned polls</li>
            <li>Authorize voters before they can vote</li>
          </ul>
        )}
      </aside>
    </div>
  );
}
