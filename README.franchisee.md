# Franchisee Owner Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing.

For **franchisee owners** (organization admins) who create and manage polls for their group.

---

## Dashboard
- Access AdminPanel → select your franchisee → view polls, status, and setup warnings.

## Creating a Poll
Fill in title, start time, duration, then optionally enable:
- **Secret ballot** — commit-reveal mode for vote privacy.
- **Gasless voting** — ⛽ button for voters, gas sponsored by VotingPaymaster.
- **Tokens per voter** — for weighted voting. Leave as 1 for standard.

After creation, add candidates and voters. The setup checklist flags missing steps.

### Poll Metadata (IPFS)
Attach descriptions, rules, or supporting documents to polls:
1. Upload your file to IPFS and get a CID.
2. In AdminPanel → "Set Poll Metadata", enter `ipfs://QmYourCID`.
3. **Must be set before the poll starts** — metadata is locked once the poll is active.

Voters see a clickable link to the metadata from their poll card.

## Managing Polls
- Dashboard shows real-time status and warnings.
- "⚠ Incomplete" = no candidates added or paymaster underfunded.
- Poll settings are editable before the poll starts.

## Voting & Reveal
- After a secret ballot poll ends, voters must reveal their votes.
- Click **"Reveal All"** to auto-reveal all pending votes. If the reveal phase is still active, retry after it ends.
- Results and tie detection display automatically.

> **Important:** Voters must not clear browser storage before revealing — see [ARCHITECTURE.md § The Salt Problem](ARCHITECTURE.md#critical-insight-the-salt-problem).

## FAQ

**Can voters use both gasless and regular voting in the same poll?**
Yes. Mixing is safe — the contract doesn't distinguish how gas was paid. Reveal works the same for both.

**Do auto-reveal errors in the console cost gas?**
No. The retry loop uses free read-only calls to check timing. No transaction is sent until the reveal window is open.

## Troubleshooting
- Dashboard warnings → check candidates and paymaster funding.
- Voters can't reveal → remind them to use the same browser/device.
- Paymaster underfunded → top up balance via the paymaster section.
- `PollStarted` error when setting metadata → metadata can only be set before the poll starts.

> For comprehensive troubleshooting, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting).
> For technical architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).