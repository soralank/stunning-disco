import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import VoterPage from './pages/VoterPage';
import AdminPage from './pages/AdminPage';
import FranchiseePage from './pages/FranchiseePage';
import ResultsPage from './pages/ResultsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/local/voter" replace />} />

        {/* Local Testing Routes (Hardhat accounts - no MetaMask needed) */}
        <Route path="/local" element={<Navigate to="/local/voter" replace />} />
        <Route path="/local/voter" element={<VoterPage mode="local" />} />
        <Route path="/local/admin" element={<AdminPage mode="local" />} />
        <Route path="/local/franchisee" element={<FranchiseePage mode="local" />} />
        <Route path="/local/results" element={<ResultsPage mode="local" />} />

        {/* Production/Testnet Routes (MetaMask required) */}
        <Route path="/voter" element={<VoterPage mode="production" />} />
        <Route path="/admin" element={<AdminPage mode="production" />} />
        <Route path="/franchisee" element={<FranchiseePage mode="production" />} />
        <Route path="/results" element={<ResultsPage mode="production" />} />
      </Routes>
    </Layout>
  );
}