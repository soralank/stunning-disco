import React from 'react';
import { render, screen } from '@testing-library/react';
import VoteList from '../components/VoteList';

describe('VoteList', () => {
  it('renders local test accounts including account #4', () => {
    render(<VoteList mode="local" />);

    expect(screen.getByText('Select Test Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account #1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account #4' })).toBeInTheDocument();
  });
});
