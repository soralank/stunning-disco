# Admin Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing.

For **system administrators** who manage the voting platform, deploy contracts, and oversee all franchisees and polls.

---

## Key Admin Actions

### Deploy & Configure
- Deploy contracts using Hardhat (see [ARCHITECTURE.md](ARCHITECTURE.md) for contract details).
- Set up franchisees and assign owners.
- Configure environment variables per [ARCHITECTURE.md § Environment Variables](ARCHITECTURE.md#environment-variables).

### Create Polls
When creating a poll, configure:
- **Gasless voting** — enables ⛽ Vote Gasless button. Uses VotingPaymaster to sponsor gas.
- **Tokens per voter** — for token-weighted voting. Leave as 1 for standard.
- **Secret ballot** — commit-reveal mode for vote privacy.

After creation, add candidates and voters. Dashboard warnings flag incomplete setup.

### Manage Franchisees
- Add franchisees (organizations) via AdminPanel → assign owners → monitor poll status.

### Monitor Polls
- View all polls across franchisees with real-time status, warnings, and results.
- Filter, search, and expand poll details from the dashboard.

### Emergency Actions
- Reveal results if franchisee is unavailable.
- Fund paymaster for gasless voting.
- Remove or reassign franchisee owners.

## Best Practices
- Verify contract addresses and network before admin actions.
- Act on dashboard warnings proactively ("⚠ Incomplete" = missing candidates or underfunded paymaster).
- For secret ballots, ensure franchisee owners understand the reveal process — see [ARCHITECTURE.md § The Salt Problem](ARCHITECTURE.md#critical-insight-the-salt-problem).

## Troubleshooting
- "⚠ Incomplete" → check candidates and paymaster funding.
- Voters can't vote → verify authorization and poll timing.
- Secret ballot reveal → click "Reveal All". If reveal phase is still active, retry after it ends.

> For comprehensive troubleshooting, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting).
> For security analysis, see [ARCHITECTURE.md](ARCHITECTURE.md).