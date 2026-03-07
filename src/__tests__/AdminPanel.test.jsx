import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminPanel from '../components/AdminPanel';

describe('AdminPanel', () => {
  it('renders owner account button in local admin mode', () => {
    render(<AdminPanel mode="local" />);

    // Admin mode (no role prop) shows only Account #0 (the owner)
    expect(screen.getByRole('button', { name: 'Account #0 (Owner)' })).toBeInTheDocument();
  });

  it('renders all test accounts in local franchisee mode', () => {
    render(<AdminPanel mode="local" role="franchisee" />);

    // Franchisee mode shows all Hardhat accounts
    expect(screen.getByRole('button', { name: 'Account #0 (Owner)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account #4' })).toBeInTheDocument();
  });
});
