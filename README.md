# Election Voting System

> Copyright © 2026 Ankit Soral. All rights reserved. Proprietary and confidential.\
> Unauthorized use, reproduction, or distribution is prohibited.

**Status:** Frontend and smart contract integration complete. Professional security audit pending.\
**Contact:** ankit.soral@outlook.com

A decentralized election voting system built with React and Solidity smart contracts. Supports admin controls, voter authorization, time-based voting, gasless meta-transactions (EIP-712), secret ballots (commit-reveal), token-weighted voting, and multi-franchisee poll management.

## Documentation Map

| Document | Audience | Purpose |
|---|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Engineers, auditors | Trust model, state ownership, failure UX, security analysis, flow diagrams |
| **[TESTING.md](TESTING.md)** | Developers, QA | Local setup, mode switching, test checklists, troubleshooting |
| **[WORKFLOW.md](WORKFLOW.md)** | Developers | End-to-end voting walkthrough with exact steps |
| **[README.admin.md](README.admin.md)** | System admins | Admin-specific operations and best practices |
| **[README.franchisee.md](README.franchisee.md)** | Franchisee owners | Poll creation, management, and reveal process |
| **[README.voter.md](README.voter.md)** | Voters | How to vote, reveal, and view results |
| **[CONTRIBUTE.md](CONTRIBUTE.md)** | Contributors | Contribution guidelines and code style |

## Features

- **Owner Controls**: Create polls, assign administrators, transfer ownership
- **Admin/Franchisee Functions**:
   - Create polls with custom duration, start time, and advanced options (gasless voting, token-weighted voting, secret ballot)
   - Add candidates, authorize voters (single or bulk), reveal results, end polls
- **Voter Features**:
   - View authorized polls, cast votes (standard, gasless, or weighted), reveal secret ballots, view results with winner/tie detection
- **Contract-Enforced Security**:
   - One vote per address per poll (contract-enforced, not just UI)
   - Time-locked voting periods via `block.timestamp`
   - Results hidden until explicitly revealed
   - Immutable on-chain voting records
   - All frontend role checks are cosmetic — see [ARCHITECTURE.md § Access Control Model](ARCHITECTURE.md#access-control-model)

## Prerequisites

- Node.js (v14 or later)
- MetaMask browser extension or compatible Web3 wallet
- Hardhat (for local blockchain testing)

## Quick Setup

### 1. Start Blockchain & Deploy

```bash
# Terminal 1: Start Hardhat node
cd /Users/ankit/work/git/votingsystem
npm install && npx hardhat node

# Terminal 2: Deploy contracts
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy-and-setup.js --network localhost
```

Copy the contract addresses from the deployment output.

### 2. Configure & Start Frontend

```bash
cd /Users/ankit/work/git/stunning-disco
npm install
cp .env.example .env.development
# Edit .env.development with deployed addresses (see Environment Variables below)
npm start
```

App opens at [http://localhost:3000](http://localhost:3000) — defaults to local testing mode.

### 3. MetaMask Network Configuration

| Setting | Value |
|---|---|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | 31337 |
| Currency | ETH |

### Environment Variables

See [ARCHITECTURE.md § Environment Variables](ARCHITECTURE.md#environment-variables) for the full reference. Minimum required:

```env
REACT_APP_CONTRACT_ADDRESS=<ElectionsManager address>
REACT_APP_TOKEN_MANAGER_ADDRESS=<TokenManager address>
REACT_APP_VOTING_PAYMASTER_ADDRESS=<VotingPaymaster address>
REACT_APP_SECRET_BALLOT_MANAGER_ADDRESS=<SecretBallotManager address>
REACT_APP_FRANCHISE_MANAGER_ADDRESS=<FranchiseManager address>
REACT_APP_VOTING_READER_ADDRESS=<VotingReader address>
REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545
```

## Usage Overview

### For Owners / Admins

1. Open `/local/admin` (local mode) or `/admin` (production with MetaMask)
2. Create poll → add candidates → authorize voters → wait for expiry → reveal results

### For Voters

1. Open `/local/voter` (local mode) or `/voter` (production with MetaMask)
2. View authorized polls → vote → (for secret ballot: return to reveal after poll ends)

> For detailed step-by-step walkthroughs, see [WORKFLOW.md](WORKFLOW.md).

## Contract Functions Reference

### Write Functions

| Function | Caller | Description |
|---|---|---|
| `createPoll(title, admin, startTime, duration)` | Owner | Create poll with unix timestamp start |
| `addOptionToPoll(pollId, name)` | Admin/Owner | Add a candidate |
| `addVoters(pollId, voters[])` | Admin/Owner | Authorize multiple voters |
| `removeVoter(pollId, voter)` | Admin/Owner | Revoke voter authorization |
| `voteInPoll(pollId, optionId)` | Voter | Cast a standard vote |
| `revealResults(pollId)` | Admin/Owner | Make results public |
| `endPoll(pollId)` | Admin/Owner | Permanently close a poll |
| `transferOwnership(newOwner)` | Owner | Transfer contract ownership |

### Read Functions

| Function | Returns |
|---|---|
| `polls(pollId)` | Poll details (title, admin, timing, status) |
| `getOption(pollId, optionId)` | Candidate name and vote count |
| `isVoterAuthorized(pollId, voter)` | Boolean |
| `hasVoterVoted(pollId, voter)` | Boolean |
| `isPollActive(pollId)` | Boolean |
| `getWinner(pollId)` | Winning candidate ID |
| `getTotalVotes(pollId)` | Total votes cast |

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| "Error loading polls" / "could not decode result data" | Wrong contract address or contract not deployed | Verify Hardhat node is running, redeploy, update `.env.development` |
| Transaction fails silently | Wrong account (owner/admin/voter mismatch) | Check connected account role |
| MetaMask "wrong network" | Chain ID mismatch | Switch to Hardhat Local (Chain ID 31337) |
| "Insufficient funds" | Gas fees on production network | Use Hardhat test accounts (10,000 ETH each) for local testing |
| Build errors | Stale dependencies | `rm -rf node_modules package-lock.json && npm install` |

> For comprehensive troubleshooting by mode, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting).

## License

Copyright © 2026 Ankit Soral. All rights reserved. See [LICENSE.txt](LICENSE.txt).

### Dual-License Consideration

This project is currently under a proprietary all-rights-reserved license. For open-source credibility and community adoption, a dual-license model is under evaluation:

| License | Scope | Audience |
|---|---|---|
| **AGPL-3.0** (or GPL-3.0) | Default open-source license | Community users, academic use, public forks |
| **Commercial License** | Proprietary use, SaaS deployment, white-labeling | Enterprise customers, closed-source integrators |

**Why dual-license:**
- AGPL's copyleft requirement (any network-accessible derivative must publish source) protects the project from closed-source exploitation while allowing genuine open-source use.
- A separate commercial license provides an explicit path for enterprises that cannot comply with AGPL's source disclosure requirements.
- This model is well-established in production blockchain tooling (e.g., OpenZeppelin, Foundry, Hardhat plugins).

**Status:** Under evaluation. Contact ankit.soral@outlook.com for licensing inquiries.
