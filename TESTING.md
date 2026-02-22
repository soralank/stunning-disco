# Testing Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing details.

The voting system has **two separate modes** via routing. This guide covers setup, test flows, and troubleshooting for both.

---

## Modes

### Local Testing Mode (No MetaMask needed)

| Route | Purpose |
|---|---|
| `/local/voter` | Voter interface with Hardhat account buttons |
| `/local/admin` | Admin interface with Hardhat account buttons |
| `/local/franchisee` | Franchisee interface |
| `/local/results` | Public results viewer |

Click account buttons to connect instantly. Uses Hardhat test accounts (Account #0–#4). No MetaMask required.

### Production / Testnet Mode (MetaMask required)

| Route | Purpose |
|---|---|
| `/voter` | Voter interface — MetaMask wallet connection |
| `/admin` | Admin interface — MetaMask wallet connection |
| `/franchisee` | Franchisee interface — MetaMask wallet connection |
| `/results` | Public results viewer |

Switching: use the "→ Production Mode" / "→ Local Testing" links in the navigation bar.

---

## Quick Start — Local Testing

### 1. Start Hardhat Node
```bash
cd /Users/ankit/work/git/votingsystem && npx hardhat node
```

### 2. Deploy Contracts
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy-and-setup.js --network localhost
```
Copy all contract addresses from the output.

### 3. Configure & Start Frontend
```bash
cd /Users/ankit/work/git/stunning-disco
npm install
```
Update `.env.development` with the deployed addresses (see [ARCHITECTURE.md § Environment Variables](ARCHITECTURE.md#environment-variables) for the full list).

```bash
npm start
```
App opens at http://localhost:3000 (defaults to local mode).

### 4. Run the Test Flow

See [WORKFLOW.md](WORKFLOW.md) for the full step-by-step walkthrough. Quick summary:

1. `/local/admin` → Account #0 → Create poll → Add candidates → Authorize voters
2. `/local/voter` → Account #1 → Vote → Switch to Account #2 → Vote → etc.
3. Wait for poll to expire (or skip time with Hardhat — see below)
4. `/local/admin` → Account #0 → Reveal Results
5. `/local/voter` → Show Results → See winner

### Skip Time (for testing)
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat console --network localhost
```
```javascript
await network.provider.send("evm_increaseTime", [300]);
await network.provider.send("evm_mine");
```

---

## Testing Checklists

### Local Mode (`/local/*`)
- [ ] Can click Account #0 and connect instantly
- [ ] Can create poll as owner
- [ ] Can add candidates
- [ ] Can copy and add voter addresses
- [ ] Can switch to Account #1–#4 and see authorized polls
- [ ] Can vote as each account
- [ ] Can reveal results after time expires
- [ ] Can see winner and vote counts

### Production Mode (`/admin`, `/voter`)
- [ ] Shows "Connect MetaMask" button only — no local account buttons
- [ ] MetaMask connection works
- [ ] All features work with MetaMask signatures
- [ ] Chain ID mismatch shows advisory warning

### Automated Tests
```bash
npm test
```
Runs UI smoke tests for component rendering and basic interactions.

---

## Deploying to Sepolia

```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy.js --network sepolia
```

Update `.env.development` with Sepolia addresses, then use production mode routes (`/admin`, `/voter`). MetaMask handles all transactions.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `contract.owner is not a function` | Contract not deployed or wrong address | Redeploy, update `.env.development`, restart app |
| "Cannot connect to localhost" | Hardhat node not running | Run `npx hardhat node` |
| No polls showing | Wrong route or not connected | Use `/local/admin` (not `/admin`), connect Account #0 |
| "Error loading polls: could not decode result data" | ABI mismatch or wrong contract address | Re-run `update-abi.js`, update env vars, restart |
| Can't reveal results | Poll hasn't expired | Wait for duration or skip time with Hardhat console |
| Voters can't see poll | Not authorized | Admin adds voter addresses via "Add Voters" section |
| Transaction fails | Wrong account role | Check expected role (owner/admin/voter) matches connected account |
| Build errors | Stale dependencies | `rm -rf node_modules package-lock.json && npm install` |

> For detailed UX behavior under blockchain failures, see [ARCHITECTURE.md § Blockchain Failure UX](ARCHITECTURE.md#blockchain-failure-ux).

---

## Test Accounts Reference

| Account | Address | Role |
|---|---|---|
| Account #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Owner (creates polls) |
| Account #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Voter |
| Account #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Voter |
| Account #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Voter |
| Account #4 | `0x2546bcd3c84621e976d8185a91a922ae77ecec30` | Voter |

> Private keys are Hardhat's well-known defaults. See [ARCHITECTURE.md § Hardcoded Test Keys](ARCHITECTURE.md#hardcoded-test-keys) for security analysis.

---

## Quick Commands

```bash
# Start blockchain
cd /Users/ankit/work/git/votingsystem && npx hardhat node

# Deploy with sample data
cd /Users/ankit/work/git/votingsystem && npx hardhat run scripts/deploy-and-setup.js --network localhost

# Start frontend
cd /Users/ankit/work/git/stunning-disco && npm start

# Skip time (Hardhat console)
await network.provider.send("evm_increaseTime", [300])
await network.provider.send("evm_mine")
```
