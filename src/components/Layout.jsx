import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const loc = useLocation();
  const isLocal = loc.pathname.startsWith('/local');

  return (
    <div className="app-root">
      <header className="site-header">
        <div className="brand">
          BLockchain Voting System
          {isLocal && <span style={{
            marginLeft: 10,
            padding: '2px 8px',
            background: '#1976d2',
            color: 'white',
            fontSize: 12,
            borderRadius: 3
          }}>LOCAL MODE</span>}
        </div>
        <nav className="site-nav">
          {isLocal ? (
            <>
              <Link className={loc.pathname === '/local/admin' ? 'active' : ''} to="/local/admin">Admin</Link>
              <Link className={loc.pathname === '/local/franchisee' ? 'active' : ''} to="/local/franchisee">Franchisee</Link>
              <Link className={loc.pathname === '/local/voter' ? 'active' : ''} to="/local/voter">Voter</Link>
              <Link className={loc.pathname === '/local/results' ? 'active' : ''} to="/local/results">Results</Link>
              <Link to="/voter" style={{ marginLeft: 20, color: '#999' }}>→ Production Mode</Link>
            </>
          ) : (
            <>
              <Link className={loc.pathname === '/admin' ? 'active' : ''} to="/admin">Admin</Link>
              <Link className={loc.pathname === '/franchisee' ? 'active' : ''} to="/franchisee">Franchisee</Link>
              <Link className={loc.pathname === '/voter' ? 'active' : ''} to="/voter">Voter</Link>
              <Link className={loc.pathname === '/results' ? 'active' : ''} to="/results">Results</Link>
              {process.env.NODE_ENV !== 'production' && (
                <Link to="/local/voter" style={{ marginLeft: 20, color: '#999' }}>→ Local Testing</Link>
              )}
            </>
          )}
        </nav>
      </header>

      <main className="container">
        {children}
      </main>

      <footer className="site-footer">
        <small>{isLocal ? 'Local Testing Mode - No MetaMask needed' : 'Production Mode - Connect MetaMask to interact'}</small>
      </footer>
    </div>
  );
}
