import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminPanel from '../components/AdminPanel';

describe('AdminPanel', () => {
  it('renders local test accounts including account #4', () => {
    render(<AdminPanel mode="local" />);

    expect(screen.getByText('Select a test account (no MetaMask needed).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account #0 (Owner)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account #4' })).toBeInTheDocument();
  });
});
