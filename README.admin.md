# Stunning Disco Voting System — Admin Guide

## Who is this for?
This guide is for **system administrators** who manage the overall voting platform, deploy contracts, and oversee all franchisees and polls.

---

## 1. System Overview
- The platform is a decentralized voting system using Ethereum smart contracts and a React frontend.
- Admins can create franchisees, manage global settings, and monitor all polls.

## 2. Key Admin Actions
### e. Creating Polls with Advanced Options

When creating a poll (as admin or franchisee owner), you can now configure advanced options:
  - **Enable gasless voting**: Allows voters to vote without paying gas. When enabled, the ⛽ Vote Gasless button will appear for voters. This uses the VotingPaymaster contract to sponsor gas fees.
  - **Tokens per voter**: Set the number of voting tokens each voter receives (for token-weighted voting). Leave as 1 for standard voting.
  - **Enable secret ballot**: Optionally enable commit-reveal voting for privacy.

After poll creation, add candidates and voters as usual. Use the dashboard warnings to ensure all setup steps are complete.
### a. Deploy & Configure
- Deploy contracts using Hardhat (see ARCHITECTURE.md for details).
- Set up franchisees and assign owners.

### b. Manage Franchisees
- Add new franchisees (organizations) via the AdminPanel.
- Assign franchisee owners (addresses).
- Monitor all franchisee activity and poll status.

### c. Monitor Polls
- View all polls across franchisees.
- See real-time status, warnings (e.g., incomplete setup, underfunded paymaster), and results.
- Use the dashboard to filter, search, and expand poll details.

### d. Emergency Actions
- If a poll is stuck or misconfigured, admins can:
  - Reveal results (if franchisee is unavailable)
  - Fund paymaster for gasless voting
  - Remove or reassign franchisee owners

## 3. Best Practices
- Always verify contract addresses and network before performing admin actions.
- Use the dashboard warnings to proactively fix incomplete polls.
- For secret ballots, ensure franchisee owners understand the reveal process.

## 4. Troubleshooting
- If a poll shows "⚠ Incomplete", check for missing candidates or paymaster issues.
- If voters cannot vote, verify poll settings and voter authorization.
- For secret ballots, use the "Reveal All" button to finalize results if voters do not reveal in time. The system will attempt to reveal results immediately. If the reveal phase is still active, you'll see "Waiting for reveal phase to end..."—just try again after the reveal phase ends (no need to wait on the page).

---
For technical details, see ARCHITECTURE.md. For franchisee and voter instructions, see their respective guides.