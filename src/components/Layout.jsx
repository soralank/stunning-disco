import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchContractVersion, getProvider } from '../contract';

export default function Layout({ children }) {
  const loc = useLocation();
  const isLocal = loc.pathname.startsWith('/local');
  const isUpgradeable = loc.pathname.includes('/upgradeable');
  const [onChainVersion, setOnChainVersion] = useState(null);

  // Fetch the on-chain version for the active contract (final vs upgradeable)
  useEffect(() => {
    let cancelled = false;
    setOnChainVersion(null); // reset on route change
    (async () => {
      try {
        const ver = await fetchContractVersion(getProvider(), { upgradeable: isUpgradeable });
        if (!cancelled && ver) setOnChainVersion(ver);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isUpgradeable]);

  // Badge is route-driven, not env-driven
  const isFinalRoute = !isUpgradeable;
  const badgeLabel = isFinalRoute
    ? (onChainVersion ? `Final v${onChainVersion}` : 'Final')
    : (onChainVersion ? `v${onChainVersion}` : 'Upgradeable');
  const badgeColor = isFinalRoute ? '#1565c0' : '#2e7d32';

  const localBase = '/local';
  const localUpg = '/local/upgradeable';
  const prodUpg = '/upgradeable';

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
          <span style={{
            marginLeft: 10,
            padding: '2px 8px',
            background: badgeColor,
            color: 'white',
            fontSize: 11,
            borderRadius: 3,
            fontWeight: 'bold',
            letterSpacing: 0.5,
          }}
            title={`Route: ${isFinalRoute ? 'Final' : 'Upgradeable'} | On-chain: ${onChainVersion || 'unknown'}`}
          >
            {badgeLabel}
            {isFinalRoute && ' ✦'}
          </span>
        </div>
        <nav className="site-nav">
          {isLocal ? (
            isUpgradeable ? (
              /* Local + Upgradeable nav */
              <>
                <Link className={loc.pathname === `${localUpg}/admin` ? 'active' : ''} to={`${localUpg}/admin`}>⬆ Admin</Link>
                <Link className={loc.pathname === `${localUpg}/voter` ? 'active' : ''} to={`${localUpg}/voter`}>⬆ Voter</Link>
                <Link className={loc.pathname === `${localUpg}/results` ? 'active' : ''} to={`${localUpg}/results`}>⬆ Results</Link>
                <Link to={`${localBase}/admin`} style={{ marginLeft: 20, color: '#999' }}>← Final Pages</Link>
              </>
            ) : (
              /* Local + Final nav */
              <>
                <Link className={loc.pathname === `${localBase}/admin` ? 'active' : ''} to={`${localBase}/admin`}>Admin</Link>
                <Link className={loc.pathname === `${localBase}/franchisee` ? 'active' : ''} to={`${localBase}/franchisee`}>Franchisee</Link>
                <Link className={loc.pathname === `${localBase}/voter` ? 'active' : ''} to={`${localBase}/voter`}>Voter</Link>
                <Link className={loc.pathname === `${localBase}/results` ? 'active' : ''} to={`${localBase}/results`}>Results</Link>
                <Link to={`${localUpg}/admin`} style={{ marginLeft: 20, color: '#999' }}>→ Upgradeable</Link>
                <Link to="/voter" style={{ marginLeft: 8, color: '#999' }}>→ Production</Link>
              </>
            )
          ) : (
            isUpgradeable ? (
              /* Production + Upgradeable nav */
              <>
                <Link className={loc.pathname === `${prodUpg}/admin` ? 'active' : ''} to={`${prodUpg}/admin`}>⬆ Admin</Link>
                <Link className={loc.pathname === `${prodUpg}/voter` ? 'active' : ''} to={`${prodUpg}/voter`}>⬆ Voter</Link>
                <Link className={loc.pathname === `${prodUpg}/results` ? 'active' : ''} to={`${prodUpg}/results`}>⬆ Results</Link>
                <Link to="/admin" style={{ marginLeft: 20, color: '#999' }}>← Final Pages</Link>
              </>
            ) : (
              /* Production + Final nav */
              <>
                <Link className={loc.pathname === '/admin' ? 'active' : ''} to="/admin">Admin</Link>
                <Link className={loc.pathname === '/franchisee' ? 'active' : ''} to="/franchisee">Franchisee</Link>
                <Link className={loc.pathname === '/voter' ? 'active' : ''} to="/voter">Voter</Link>
                <Link className={loc.pathname === '/results' ? 'active' : ''} to="/results">Results</Link>
                <Link to={`${prodUpg}/admin`} style={{ marginLeft: 20, color: '#999' }}>→ Upgradeable</Link>
                {process.env.REACT_APP_LOCAL_TESTING === 'true' && (
                  <Link to="/local/voter" style={{ marginLeft: 8, color: '#999' }}>→ Local Testing</Link>
                )}
              </>
            )
          )}
        </nav>
      </header>

      <main className="container">
        {children}
      </main>

      <footer className="site-footer">
        <small>
          {isLocal ? 'Local Testing Mode - No MetaMask needed' : 'Production Mode - Connect MetaMask to interact'}
          {isUpgradeable && ' | Upgradeable Contract'}
          {' | '}
          {badgeLabel}
        </small>
      </footer>
    </div>
  );
}
