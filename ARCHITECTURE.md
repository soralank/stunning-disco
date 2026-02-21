# Stunning Disco Voting System — Architecture Overview

## System Overview
Stunning Disco is a decentralized voting platform built with a React frontend and Ethereum smart contracts. It supports multiple poll types, secret ballots, gasless voting, and franchisee-based poll management.

### Key Components
- **Frontend:** React (JSX), ethers.js for blockchain interaction
- **Smart Contracts:**
  - `ElectionsManager`: Main poll logic
  - `FranchiseManager`: Franchisee management
  - `VotingPaymaster`: Gasless voting sponsor
  - `SecretBallotManager`: Commit-reveal secret ballot
  - `TokenManager`: (optional) ERC20 voting tokens
- **Local Blockchain:** Hardhat (for development/testing)

## Data Flow
1. **Poll Creation:**
   - Admin or franchisee creates a poll via the frontend, which calls `ElectionsManager`.
   - Poll settings, candidates, and voters are configured before poll start.
2. **Voting:**
   - Voters see authorized polls in the frontend.
   - For secret ballots, votes are committed (hash stored on-chain) and revealed later with a salt.
   - Gasless voting uses `VotingPaymaster` to sponsor transaction fees.
3. **Reveal & Results:**
   - After poll ends, voters reveal their votes (if secret ballot).
   - Franchisee/admin can click "Reveal All" to auto-reveal all pending votes and finalize results.
   - Results are displayed in real time.

## Key Features
- **Secret Ballot:** Commit-reveal with local salt storage; franchisee can auto-reveal all votes after poll ends. The reveal flow now gives instant feedback—if the reveal phase is still active, users are prompted to retry after it ends (no more polling loop).
- **Gasless Voting:** Paymaster contract funds voter transactions; warnings shown if underfunded. Franchisee and admin can enable gasless voting per poll, which shows the ⛽ Vote Gasless button for voters.
- **Token-Weighted Voting:** Each poll can specify tokens-per-voter for token-weighted voting (default is 1 for standard voting).
- **Franchisee Model:** Each franchisee manages their own polls, candidates, and voters.
- **Tie Detection:** UI highlights ties in results.
- **Incomplete Poll Warnings:** UI warns if poll setup is incomplete (e.g., no candidates, underfunded paymaster).

## File Structure
- `src/components/` — React UI components (AdminPanel, VoteList, ResultsList, etc.)
- `src/contract/` — Contract ABIs and helper functions
- `public/` — Static assets
- `build/` — Production build output

## Notable Flows
- **Reveal All:** Franchisee can reveal all pending secret ballot votes for a poll in one click; the app uses localStorage salts and Hardhat keys (in local mode) to submit all reveals before finalizing results.
- **Warnings:** UI shows real-time warnings for incomplete polls, underfunded paymaster, and missing candidates.

## Security Notes
- **LocalStorage:** Salts for secret ballots are stored in browser localStorage; users should not clear storage before reveal.
- **Private Keys:** In local mode, Hardhat private keys are used for auto-reveal/testing only.

---
For more details, see the user-specific guides in this repo.
