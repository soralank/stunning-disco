# Election Voting System

> Copyright © 2026 Ankit Soral. All rights reserved. Proprietary and confidential.\
> Unauthorized use, reproduction, or distribution is prohibited.

**Status:** Production-ready. Deployed on Sepolia testnet. Professional security audit pending.\
**Live URL:** [https://soralank.github.io/stunning-disco](https://soralank.github.io/stunning-disco)\
**Contact:** ankit.soral@outlook.com

A decentralized election voting system built with React and Solidity smart contracts on Ethereum. Supports admin controls, voter authorization, time-based voting, gasless meta-transactions (EIP-712), secret ballots (commit-reveal), token-weighted voting, and multi-franchisee poll management.

## Documentation

| Document | Audience | Purpose |
|---|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Engineers, auditors | Trust model, state ownership, failure UX, security analysis, flow diagrams |
| **[TESTING.md](TESTING.md)** | Developers, QA | CI/CD pipeline, automated tests, local development setup |
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
- **Upgradeable Contract Support (V1/V2)**:
   - Separate UI routes (`/upgradeable/*`) for UUPS proxy contracts
   - V1: Core voting (same features as Final, behind an upgradeable proxy)
   - V2: Adds poll categories, vote weights (1–10×), pause/unpause, on-chain descriptions, deadline extension, emergency end, participation stats
   - Configurable via `REACT_APP_CONTRACT_VERSION` (1 or 2)
   - Upgrade path: V1 → V2 via `upgradeToAndCall()` preserving all poll data
- **Contract-Enforced Security**:
   - One vote per address per poll (contract-enforced, not just UI)
   - Time-locked voting periods via `block.timestamp`
   - Results hidden until explicitly revealed
   - Immutable on-chain voting records
   - All frontend role checks are cosmetic — see [ARCHITECTURE.md § Access Control Model](ARCHITECTURE.md#access-control-model)

## Prerequisites

- **MetaMask** browser extension (or any compatible Web3 wallet)
- **Sepolia ETH** for gas fees ([Sepolia faucet](https://sepoliafaucet.com))
- Node.js v18+ (for development only)

## Production Deployment

The app is deployed automatically via GitHub Actions when you push to `main`:

1. CI runs tests
2. Builds the React app with Sepolia contract addresses (from GitHub Secrets)
3. Deploys to **GitHub Pages** at [https://soralank.github.io/stunning-disco](https://soralank.github.io/stunning-disco)
4. Also pushes a Docker image to `ghcr.io/soralank/stunning-disco:prod`

### MetaMask Configuration (Sepolia)

| Setting | Value |
|---|---|
| Network Name | Sepolia Testnet |
| RPC URL | `https://rpc.sepolia.org` (or MetaMask built-in) |
| Chain ID | 11155111 |
| Currency | SepoliaETH |

### Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `REACT_APP_CONTRACT_ADDRESS_PROD` | ElectionsManager address on Sepolia |
| `REACT_APP_TOKEN_MANAGER_ADDRESS_PROD` | TokenManager address on Sepolia |
| `REACT_APP_VOTING_PAYMASTER_ADDRESS_PROD` | VotingPaymaster address on Sepolia |

### Environment Variables

See [ARCHITECTURE.md § Environment Variables](ARCHITECTURE.md#environment-variables) for the full reference. Key variables:

```env
REACT_APP_CONTRACT_ADDRESS=<ElectionsManager address>
REACT_APP_TOKEN_MANAGER_ADDRESS=<TokenManager address>
REACT_APP_VOTING_PAYMASTER_ADDRESS=<VotingPaymaster address>
REACT_APP_SECRET_BALLOT_MANAGER_ADDRESS=<SecretBallotManager address>
REACT_APP_FRANCHISE_MANAGER_ADDRESS=<FranchiseManager address>
REACT_APP_VOTING_READER_ADDRESS=<VotingReader address>
REACT_APP_CHAIN_ID=11155111

# For upgradeable contracts (optional):
REACT_APP_UPGRADEABLE_CONTRACT_ADDRESS=<Proxy address>
REACT_APP_CONTRACT_VERSION=2  # 1 for V1, 2 for V2
```

## Usage

### For Owners / Admins

1. Open [/admin](https://soralank.github.io/stunning-disco/admin) and connect MetaMask
2. Create poll → add candidates → authorize voters → wait for expiry → reveal results

See [README.admin.md](README.admin.md) for detailed admin operations.

### For Franchisee Owners

1. Open [/franchisee](https://soralank.github.io/stunning-disco/franchisee) and connect MetaMask
2. Manage your organization's polls, candidates, and voters

See [README.franchisee.md](README.franchisee.md) for the full guide.

### For Voters

1. Open [/voter](https://soralank.github.io/stunning-disco/voter) and connect MetaMask
2. View authorized polls → vote → (for secret ballot: return to reveal after poll ends)

See [README.voter.md](README.voter.md) for the full guide.

### Routes

| Route | Purpose |
|---|---|
| `/admin` | Admin panel — poll management, infrastructure |
| `/franchisee` | Franchisee panel — organization poll management |
| `/voter` | Voter interface — view polls, cast votes |
| `/results` | Public results viewer |
| `/upgradeable/admin` | Admin panel for V1/V2 upgradeable contracts |
| `/upgradeable/voter` | Voter interface for V1/V2 |
| `/upgradeable/results` | Results viewer for V1/V2 |

## Local Development

For local development with a Hardhat blockchain:

```bash
npm install
npm run dev    # Starts with local testing mode enabled
```

`npm run dev` enables local testing routes (`/local/*`) with Hardhat test accounts — no MetaMask needed. `npm start` runs the app without local testing UI (production-like).

See [TESTING.md](TESTING.md) for full local development setup.

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
| "Error loading polls" / "could not decode result data" | Wrong contract address or contracts not deployed | Verify contract addresses in GitHub Secrets or `.env` |
| Transaction fails silently | Wrong account (owner/admin/voter mismatch) | Check connected MetaMask account role |
| MetaMask "wrong network" | Chain ID mismatch | Switch to Sepolia Testnet (Chain ID 11155111) |
| "Insufficient funds" | Not enough Sepolia ETH | Get test ETH from a [Sepolia faucet](https://sepoliafaucet.com) |
| Build errors | Stale dependencies | `rm -rf node_modules package-lock.json && npm install` |
| Blank page on GitHub Pages | SPA routing issue | Ensure `basename` is set in router (already configured) |

> For comprehensive troubleshooting, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting).

## CI/CD Pipeline

| Trigger | Jobs |
|---|---|
| Push to `main` | Test → Build & Deploy to GitHub Pages → Push Docker image (`prod`) |
| Push to `develop` | Test → Push Docker image (`test`) |
| Pull request | Test only |

See [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) for the full pipeline.

## Mainnet Migration

When ready to move from Sepolia to Ethereum Mainnet:

1. Update `REACT_APP_CHAIN_ID` from `11155111` to `1` in CI/CD workflow (2 places)
2. Update GitHub Secrets with mainnet contract addresses
3. Push to `main`

See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

## License

Copyright © 2026 Ankit Soral. All rights reserved. See [LICENSE.txt](LICENSE.txt).

### Dual-License Consideration

This project is currently under a proprietary all-rights-reserved license. A dual-license model is under evaluation:

| License | Scope | Audience |
|---|---|---|
| **AGPL-3.0** (or GPL-3.0) | Default open-source license | Community, academic, public forks |
| **Commercial License** | Proprietary use, SaaS, white-labeling | Enterprise customers |

**Status:** Under evaluation. Contact ankit.soral@outlook.com for licensing inquiries.
