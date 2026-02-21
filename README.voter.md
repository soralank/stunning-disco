# Stunning Disco Voting System — Voter Guide
This project is proprietary and licensed under Ankit Soral's terms. Unauthorized use is prohibited.

**Project Status:** React frontend and smart contract integration are complete. Only a professional security audit is pending.

**License:** Copyright (c) 2026 Ankit Soral. All rights reserved.

For licensing or audit inquiries, contact Ankit Soral.

## Who is this for?
This guide is for **voters** participating in polls created by franchisee owners.

---

## 1. Accessing the App
- Connect your wallet or use the provided account (in local/test mode).
- The VoteList page shows all polls you are authorized to vote in.

## 2. Voting Process
- For each poll:
  - Review candidates and poll details
  - Select your choice(s) and submit your vote
- For secret ballots:
  - Your vote is committed (encrypted) first
  - After the poll ends, you must return to **reveal your vote** (using the same browser/device)

## 3. Gasless Voting
- If enabled, you can vote without paying gas fees (sponsored by the paymaster)
- If you see a warning about paymaster funds, contact your franchisee owner

## 4. Revealing Your Vote (Secret Ballot)
- After the poll ends, a "Reveal" button will appear.
- Click it to reveal your vote (using the salt stored in your browser). The system will attempt to reveal your vote immediately. If the reveal phase is still active, you'll see a message: "Waiting for reveal phase to end..."—just try again after the reveal phase ends (no need to wait on the page).
- **Do not clear browser storage** before revealing, or your vote cannot be revealed.

## 5. Results
- Once all votes are revealed, results will be shown automatically
- If you see a tie, it will be highlighted in the results

## 6. Troubleshooting
- If you cannot vote, check with your franchisee owner to ensure you are authorized
- For secret ballots, always use the same browser/device for commit and reveal
- If you miss the reveal window, your vote may not be counted

---
For more details, see ARCHITECTURE.md or contact your franchisee owner.