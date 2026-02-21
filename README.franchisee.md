# Stunning Disco Voting System — Franchisee Owner Guide

## Who is this for?
This guide is for **franchisee owners** (organization admins) who create and manage polls for their group.

---

## 1. Franchisee Dashboard
- Access the AdminPanel and select your franchisee.
- See all your polls, their status, and any setup warnings.

## 2. Creating a Poll
- Click "Create Poll" and fill in:
  - **Title, start time, duration**
  - **Enable secret ballot** (optional)
  - **Enable gasless voting** (optional): Allows voters to vote without paying gas. When enabled, the ⛽ Vote Gasless button will appear for voters. This uses the VotingPaymaster contract to sponsor gas fees.
  - **Tokens per voter**: Set the number of voting tokens each voter receives (for token-weighted voting). Leave as 1 for standard voting.
After creation, add candidates and voters in the "Participants" tab.
Use the setup checklist to ensure all required steps are complete.

## 3. Managing Polls
- Monitor poll status in the dashboard.
- Warnings (⚠ Incomplete) will appear if:
  - No candidates are added
  - Paymaster is underfunded for gasless voting
- You can edit poll settings before the poll starts.

## 4. Voting & Reveal
- For secret ballot polls, once the poll ends, voters must reveal their votes.
- As franchisee owner, you can click the **"Reveal All"** button during the reveal phase to auto-reveal all pending votes and finalize results. The system will attempt to reveal results immediately. If the reveal phase is still active, you'll see "Waiting for reveal phase to end..."—just try again after the reveal phase ends (no need to wait on the page).
- Results and tie detection are shown in the dashboard and results page.

## 5. Troubleshooting
- If voters report issues, check for dashboard warnings and ensure all setup steps are complete.
- For secret ballots, remind voters not to clear browser storage before revealing.
- If paymaster is underfunded, top up the balance to enable gasless voting.

---
For technical details, see ARCHITECTURE.md. For admin and voter instructions, see their respective guides.