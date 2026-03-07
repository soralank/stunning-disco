# Voter Guide

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing.

For **voters** participating in polls.

---

## Getting Started
- Open [/voter](https://soralank.github.io/stunning-disco/voter) and connect your MetaMask wallet.
- The voter page shows all polls you are authorized to vote in.

## Voting
1. Review candidates and poll details.
2. Click **Vote** next to your chosen candidate.
3. Confirm the transaction in your wallet.

### Gasless Voting
If enabled by your poll admin, click **⛽ Vote Gasless** — no gas fees required. If you see a paymaster warning, contact your franchisee owner.

### Secret Ballot
- Your vote is **committed** (encrypted hash stored on-chain) during the poll.
- After the poll ends, you **must return to reveal** your vote using the same browser/device.
- A "Reveal" button will appear. Click it — if the reveal phase hasn't started yet, retry after it begins.

> **Critical:** Do not clear browser storage before revealing. Your vote salt is stored only in your browser. If lost, your vote is permanently irrecoverable. See [ARCHITECTURE.md § The Salt Problem](ARCHITECTURE.md#critical-insight-the-salt-problem).

## Poll Metadata
- Some polls include a 📎 Metadata link with additional information (description, rules, candidate details).
- Click the link to view the full metadata in a new tab.

## Results
- Once votes are revealed, results display automatically with winner and tie detection.

## Troubleshooting
- Can't vote → check with your franchisee owner that you're authorized.
- Secret ballot → always use the same browser/device for commit and reveal.
- Missed reveal window → your vote may not be counted.

> For more help, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting) or contact your franchisee owner.