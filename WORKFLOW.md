# Complete Voting System Workflow

> Copyright © 2026 Ankit Soral. All rights reserved. See [README.md](README.md) for licensing details.

This guide walks through the **complete end-to-end process** of creating a poll, adding candidates, authorizing voters, voting, and revealing results using the local testing mode.

> **Prerequisites:** Hardhat node running, contract deployed, React app started. See [TESTING.md § Quick Start](TESTING.md#quick-start---local-testing) for setup.

---

## Step 1: Create a Poll (Admin/Owner)

1. Open http://localhost:3000/local/admin
2. Click **"Account #0 (Owner)"** to connect
3. You should see "Connected with Account #0 (Owner): 0xf39F..." and "(Owner)" tag
4. Scroll down to **"Create New Poll"** section
5. Fill in:
   - **Poll Title:** "Presidential Election 2024"
   - **Admin Address:** Leave empty (owner will manage it)
   - **Start Time:** Optional (leave empty to start immediately)
   - **Duration (seconds):** 300 (= 5 minutes)
6. Click **"Create Poll"** button
7. Wait for transaction to confirm
8. You should see: "✅ Poll created successfully! Poll ID: 1"
9. **The poll will now appear in the "Your Polls" list at the top of the page**

---

## Step 2: Add Candidates to the Poll

1. Still on http://localhost:3000/local/admin as Account #0
2. Scroll to **"Add Candidate"** section
3. In the **"Poll"** dropdown, select: **"Poll #1: Presidential Election 2024"**
4. In **"Candidate Name"** field, type: "Alice Johnson"
5. Click **"Add Candidate"** button
6. Wait for "✅ Candidate added successfully!"
7. **Repeat steps 3-6 for:**
   - "Bob Smith"
   - "Carol Williams"
8. You now have 3 candidates in your poll

---

## Step 3: Authorize Voters

1. Still on http://localhost:3000/local/admin as Account #0
2. Scroll to **"Add Voters"** section
3. In the **"Poll"** dropdown, select: **"Poll #1: Presidential Election 2024"**
4. Click the **"Copy Test Voter Addresses (Accounts #1, #2, #3, #4)"** button
   - This automatically fills the textarea with the addresses:
     ```
     0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
     0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
   0x90F79bf6EB2c4f870365E785982E1f101E93b906,
   0x2546bcd3c84621e976d8185a91a922ae77ecec30
     ```
5. Click **"Add Voters"** button
6. Wait for "✅ Voters added successfully!"
7. **Voters are now authorized to vote in this poll**

---

## Step 4: Vote (as Voters)

### Vote as Account #1:
1. Go to http://localhost:3000/local/voter
2. Click **"Account #1"** button to connect
3. You should see the poll: "Presidential Election 2024"
4. If the poll is scheduled, wait until it starts
5. Click **"Show Candidates & Vote"** button
5. You'll see all 3 candidates:
   - Alice Johnson [Vote]
   - Bob Smith [Vote]
   - Carol Williams [Vote]
6. Click **"Vote"** button next to "Alice Johnson"
7. Wait for transaction to confirm
8. You should see "✅ Vote submitted successfully!"
9. The poll card will now show "VOTED" badge

### Vote as Account #2:
1. Still on http://localhost:3000/local/voter
2. Click **"Account #2"** button (in the blue "Switch Test Account" box)
3. You'll see the same poll
4. Click **"Show Candidates & Vote"**
5. Click **"Vote"** next to "Bob Smith"
6. Wait for confirmation

### Vote as Account #3:
1. Still on http://localhost:3000/local/voter
2. Click **"Account #3"** button
3. Click **"Show Candidates & Vote"**
4. Click **"Vote"** next to "Alice Johnson"
5. Wait for confirmation

### (Optional) Vote as Account #4:
1. Still on http://localhost:3000/local/voter
2. Click **"Account #4"** button
3. Click **"Show Candidates & Vote"**
4. Click **"Vote"** next to "Carol Williams"
5. Wait for confirmation

**Now you have:**
- Alice Johnson: 2 votes
- Bob Smith: 1 vote
- Carol Williams: 0 votes

---

## Step 5: Wait for Poll to End

Option A: **Wait 5 minutes** for the poll to naturally expire

Option B: **Skip time using Hardhat** (faster for testing):
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat console --network localhost
```

In the Hardhat console:
```javascript
await network.provider.send("evm_increaseTime", [300]);
await network.provider.send("evm_mine");
.exit
```

---

## Step 6: Reveal Results (Admin/Owner)

1. Go back to http://localhost:3000/local/admin
2. Make sure you're connected as **Account #0 (Owner)**
3. Find your poll in the **"Your Polls"** section at the top
4. Click **"Show Details"** to expand the poll
5. You should see:
   - Status: **Expired** (if 5 minutes passed)
   - Total Votes Cast: **3**
6. Click **"Reveal Results"** button
7. Wait for transaction to confirm
8. You should see "✅ Results revealed successfully!"

---

## Step 7: View Results (Anyone)

### As Admin:
1. On http://localhost:3000/local/admin as Account #0
2. The poll details will show:
   - **Winner: Alice Johnson (2 votes)** (highlighted in yellow)
   - Candidates with vote counts:
     - Alice Johnson: 2 votes
     - Bob Smith: 1 vote
     - Carol Williams: 0 votes

### As Voter:
1. Go to http://localhost:3000/local/voter
2. Connect with any account (e.g., Account #1)
3. Click **"Show Results"** button on the poll
4. You'll see the same results with the winner highlighted

---

## Common Issues

If something goes wrong during the workflow, see [TESTING.md § Troubleshooting](TESTING.md#troubleshooting) for solutions to common problems like contract connection errors, missing polls, and reveal issues.

---

## Test Accounts

See [TESTING.md § Test Accounts Reference](TESTING.md#test-accounts-reference) for the full account table (addresses, private keys, roles).
