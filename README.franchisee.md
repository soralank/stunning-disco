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

## Managing Polls
- Dashboard shows real-time status and warnings.
- "⚠ Incomplete" = no candidates added or paymaster underfunded.
- Poll settings are editable before the poll starts.

## Voting & Reveal
- After a secret ballot poll ends, voters must reveal their votes.
- Click **"Reveal All"** to auto-reveal all pending votes. If the reveal phase is still active, retry after it ends.
- Results and tie detection display automatically.

> **Important:** Voters must not clear browser storage before revealing — see [ARCHITECTURE.md § The Salt Problem](ARCHITECTURE.md#critical-insight-the-salt-problem).

## Troubleshooting
- Dashboard warnings → check candidates and paymaster funding.
- Voters can't reveal → remind them to use the same browser/device.
- Paymaster underfunded → top up balance via the paymaster section.

> For comprehensive troubleshooting, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting).
> For technical architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).