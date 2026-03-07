# Admin Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing.

For **system administrators** who manage the voting platform, deploy contracts, and oversee all franchisees and polls.

---

## Key Admin Actions

### Deploy & Configure
- Deploy contracts to Sepolia/Mainnet (see [ARCHITECTURE.md](ARCHITECTURE.md) for contract details).
- Set up franchisees and assign owners.
- Configure contract addresses via GitHub Secrets for CI/CD deployment (see [README.md § Required GitHub Secrets](README.md#required-github-secrets)).

### Create Polls
When creating a poll, configure:
- **Gasless voting** — enables ⛽ Vote Gasless button. Uses VotingPaymaster to sponsor gas.
- **Tokens per voter** — for token-weighted voting. Leave as 1 for standard.
- **Secret ballot** — commit-reveal mode for vote privacy.

After creation, add candidates and voters. Dashboard warnings flag incomplete setup.

### Poll Metadata (IPFS)
Attach off-chain metadata (descriptions, rules, supporting docs) to polls via IPFS:

1. **Upload** your metadata file to IPFS (e.g. via IPFS Cluster API):
   ```bash
   curl -X POST -F "file=@poll-info.json" "http://127.0.0.1:9094/add"
   ```
2. **Set metadata URI** in AdminPanel → "Set Poll Metadata" using `ipfs://QmYourCID`.
3. **Timing:** Metadata must be set **before the poll starts** — once active, metadata is locked.
4. **Gateway:** Configure `REACT_APP_IPFS_GATEWAY` in your `.env` to resolve `ipfs://` URIs (e.g. `http://127.0.0.1:9090/ipfs/`).

Voters see the metadata as a clickable link on the poll card.

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
- Prepare and upload IPFS metadata **before** creating the poll, so you can set it immediately after creation (before the poll starts).

## FAQ

**Can I mix gasless and regular (gas-paying) votes in the same poll?**
Yes. The contract doesn't care who paid the gas — both call the same functions. No issues during reveal.

**Do the auto-reveal retry errors consume gas?**
No. The auto-reveal loop performs free read-only checks first. If the reveal window isn't open yet, no transaction is submitted. Failed gas estimations also don't cost anything. Gas is only spent on successful on-chain reveals.

**Can I set metadata after the poll starts?**
No. The contract reverts with `PollStarted()` if you try. Set metadata between poll creation and poll start.

## Troubleshooting
- "⚠ Incomplete" → check candidates and paymaster funding.
- Voters can't vote → verify authorization and poll timing.
- Secret ballot reveal → click "Reveal All". If reveal phase is still active, retry after it ends.

> For comprehensive troubleshooting, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting).
> For security analysis, see [ARCHITECTURE.md](ARCHITECTURE.md).