import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import VoterPage from './pages/VoterPage';
import AdminPage from './pages/AdminPage';
import FranchiseePage from './pages/FranchiseePage';
import ResultsPage from './pages/ResultsPage';
import UpgradeableAdminPage from './pages/UpgradeableAdminPage';
import UpgradeableVoterPage from './pages/UpgradeableVoterPage';
import UpgradeableResultsPage from './pages/UpgradeableResultsPage';

const IS_LOCAL_TESTING = process.env.REACT_APP_LOCAL_TESTING === 'true';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={IS_LOCAL_TESTING ? "/local/voter" : "/voter"} replace />} />

        {/* Local Testing Routes — only available when REACT_APP_LOCAL_TESTING=true (npm run dev) */}
        {IS_LOCAL_TESTING && (
          <>
            <Route path="/local" element={<Navigate to="/local/voter" replace />} />
            <Route path="/local/voter" element={<VoterPage mode="local" />} />
            <Route path="/local/admin" element={<AdminPage mode="local" />} />
            <Route path="/local/franchisee" element={<FranchiseePage mode="local" />} />
            <Route path="/local/results" element={<ResultsPage mode="local" />} />

            {/* Upgradeable contract routes (local) */}
            <Route path="/local/upgradeable" element={<Navigate to="/local/upgradeable/admin" replace />} />
            <Route path="/local/upgradeable/admin" element={<UpgradeableAdminPage mode="local" />} />
            <Route path="/local/upgradeable/voter" element={<UpgradeableVoterPage mode="local" />} />
            <Route path="/local/upgradeable/results" element={<UpgradeableResultsPage mode="local" />} />
          </>
        )}

        {/* Production/Testnet Routes (MetaMask required) */}
        <Route path="/voter" element={<VoterPage mode="production" />} />
        <Route path="/admin" element={<AdminPage mode="production" />} />
        <Route path="/franchisee" element={<FranchiseePage mode="production" />} />
        <Route path="/results" element={<ResultsPage mode="production" />} />

        {/* Upgradeable contract routes (production) */}
        <Route path="/upgradeable" element={<Navigate to="/upgradeable/admin" replace />} />
        <Route path="/upgradeable/admin" element={<UpgradeableAdminPage mode="production" />} />
        <Route path="/upgradeable/voter" element={<UpgradeableVoterPage mode="production" />} />
        <Route path="/upgradeable/results" element={<UpgradeableResultsPage mode="production" />} />
      </Routes>
    </Layout>
  );
}