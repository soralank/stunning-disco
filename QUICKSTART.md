# Quick Start Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing details.

Get up and running in 3 terminals:

```bash
# Terminal 1 — Start blockchain
cd /Users/ankit/work/git/votingsystem
npm install && npx hardhat node

# Terminal 2 — Deploy contracts with sample data
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy-and-setup.js --network localhost
# Copy the contract addresses shown

# Terminal 3 — Start frontend
cd /Users/ankit/work/git/stunning-disco
npm install
# Update .env.development with addresses from Terminal 2
npm start
```

Then:
- **Admin**: http://localhost:3000/local/admin → Click "Account #0 (Owner)"
- **Voter**: http://localhost:3000/local/voter → Click "Account #1"
- **Results**: http://localhost:3000/local/results
- **Upgradeable Admin**: http://localhost:3000/local/upgradeable/admin (V1/V2 contract)
- **Upgradeable Voter**: http://localhost:3000/local/upgradeable/voter
- **Upgradeable Results**: http://localhost:3000/local/upgradeable/results

Set `REACT_APP_CONTRACT_VERSION=1` (V1) or `2` (V2) in `.env.development` for the upgradeable routes.

---

**Next steps:**
- Full setup details → [README.md § Quick Setup](README.md#quick-setup)
- Complete end-to-end walkthrough → [WORKFLOW.md](WORKFLOW.md)
- Test checklists & troubleshooting → [TESTING.md](TESTING.md)
- Architecture, trust model, security → [ARCHITECTURE.md](ARCHITECTURE.md)
