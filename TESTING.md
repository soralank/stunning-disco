# Testing Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing details.

This guide covers CI/CD automated testing, production (Sepolia) testing, and local development setup.

---

## CI/CD Pipeline

Every push to `main` or `develop` (and every pull request) triggers automated tests via GitHub Actions:

```bash
npm ci
CI=true npm test -- --watchAll=false
```

The pipeline runs UI smoke tests for component rendering and basic interactions. See [.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml).

| Trigger | What runs |
|---|---|
| PR to `main` or `develop` | Tests only |
| Push to `develop` | Tests → Docker image (`test`) |
| Push to `main` | Tests → GitHub Pages deploy → Docker image (`prod`) |

---

## Production Testing (Sepolia)

The live app is deployed at [https://soralank.github.io/stunning-disco](https://soralank.github.io/stunning-disco).

### Prerequisites
- MetaMask with Sepolia network selected (Chain ID: 11155111)
- Sepolia ETH from a [faucet](https://sepoliafaucet.com)

### Test Checklist

#### Admin (`/admin`)
- [ ] MetaMask connects successfully
- [ ] Can create poll with title, duration, and options (gasless, secret ballot, token-weighted)
- [ ] Can add candidates to a poll
- [ ] Can authorize voter addresses
- [ ] Can manage franchisees
- [ ] Can reveal results after poll expires
- [ ] Dashboard warnings display correctly ("⚠ Incomplete", paymaster status)

#### Voter (`/voter`)
- [ ] MetaMask connects successfully
- [ ] Authorized polls appear in the list
- [ ] Can cast a standard vote
- [ ] Can cast a gasless vote (if paymaster funded)
- [ ] Can commit a secret ballot vote
- [ ] Can reveal a secret ballot after poll ends
- [ ] "VOTED" badge appears after voting
- [ ] Results display with winner/tie detection

#### Results (`/results`)
- [ ] Revealed polls show candidates, vote counts, and winner
- [ ] Unrevealed polls show appropriate status

#### Upgradeable Contracts (`/upgradeable/*`)
- [ ] V1/V2 admin features work correctly
- [ ] V2-specific features (categories, weights, pause) appear when configured

### Chain ID Verification
If MetaMask is on the wrong network, an advisory warning is shown. Ensure you're on Sepolia (11155111) before transacting.

---

## Running Tests Locally

```bash
npm test                        # Interactive watch mode
CI=true npm test -- --watchAll=false   # Single run (CI mode)
```

Tests are located in `src/__tests__/` and use `@testing-library/react`.

---

## Local Development (Hardhat)

For developing and testing with a local Hardhat blockchain, use `npm run dev` instead of `npm start`. This enables local testing routes (`/local/*`) with pre-configured Hardhat accounts — no MetaMask required.

### Setup

```bash
# Terminal 1: Start Hardhat node
cd /path/to/votingsystem
npm install && npx hardhat node

# Terminal 2: Deploy contracts
cd /path/to/votingsystem
npx hardhat run scripts/deploy-and-setup.js --network localhost

# Terminal 3: Start frontend in dev mode
cd /path/to/stunning-disco
npm install
cp .env.example .env.development
# Edit .env.development with deployed addresses
npm run dev
```

### Local Routes (only available with `npm run dev`)

| Route | Purpose |
|---|---|
| `/local/admin` | Admin interface with Hardhat account buttons |
| `/local/voter` | Voter interface with Hardhat account buttons |
| `/local/franchisee` | Franchisee interface |
| `/local/results` | Results viewer |
| `/local/upgradeable/*` | Upgradeable contract routes |

> **Note:** `npm start` does **not** show local testing routes. Local routes are strictly for development.

### Skip Time (Hardhat)
```bash
npx hardhat console --network localhost
```
```javascript
await network.provider.send("evm_increaseTime", [300]);
await network.provider.send("evm_mine");
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Error loading polls" / "could not decode result data" | Wrong contract address or ABI mismatch | Verify contract addresses in GitHub Secrets or `.env` |
| MetaMask "wrong network" | Chain ID mismatch | Switch to Sepolia Testnet (Chain ID 11155111) |
| Transaction fails silently | Wrong account role | Check connected MetaMask account matches expected role |
| "Insufficient funds" | No Sepolia ETH | Get test ETH from a [faucet](https://sepoliafaucet.com) |
| Can't reveal results | Poll hasn't expired yet | Wait for the poll duration to elapse |
| Voters can't see poll | Not authorized | Admin adds voter addresses via "Add Voters" section |
| Blank page on GitHub Pages | SPA routing issue | Hard-refresh or check deployment logs |
| Build errors | Stale dependencies | `rm -rf node_modules package-lock.json && npm install` |

> For detailed UX behavior under blockchain failures, see [ARCHITECTURE.md § Blockchain Failure UX](ARCHITECTURE.md#blockchain-failure-ux).
