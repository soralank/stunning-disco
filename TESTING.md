# Testing Guide - Local vs Production Mode
This project is proprietary and licensed under Ankit Soral's terms. Unauthorized use is prohibited.

**Project Status:** React frontend and smart contract integration are complete. Only a professional security audit is pending.

**License:** Copyright (c) 2026 Ankit Soral. All rights reserved.

See [README.md](README.md) for contact and licensing details.

## What's New

- **Advanced Poll Options:** When creating a poll, you can now enable gasless voting (⛽ Vote Gasless), set tokens-per-voter for token-weighted voting, and enable secret ballot (commit-reveal) mode.
- **Improved Reveal Flow:** Revealing secret ballot votes now gives instant feedback—if the reveal phase is still active, just retry after it ends (no more waiting loop).

The voting system now has **two separate modes** via routing:

## 🔵 Local Testing Mode (No MetaMask needed!)

**Routes:**
- `/local` → redirects to `/local/voter`
- `/local/voter` → Voter interface with Hardhat accounts
- `/local/admin` → Admin interface with Hardhat accounts

**Features:**
- Click account buttons to connect instantly
- No MetaMask required
- Uses Hardhat test accounts (Account #0, #1, #2, #3, #4)
- Perfect for development and testing

## 🟢 Production/Testnet Mode (MetaMask required)

**Routes:**
- `/voter` → Voter interface with MetaMask
- `/admin` → Admin interface with MetaMask

**Features:**
- Requires MetaMask wallet connection
- Use on Sepolia, mainnet, or other networks
- Production-ready interface

---

## Quick Start - Local Testing

### 1. Start Hardhat Node
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat node
```

### 2. Deploy Contract
```bash
npx hardhat run scripts/deploy-and-setup.js --network localhost
```
Copy the contract address shown.

### 3. Configure React App
Update `.env.development`:
```env
REACT_APP_CONTRACT_ADDRESS=<paste_contract_address_here>
REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545
```

### 4. Start React App
```bash
cd /Users/ankit/work/git/stunning-disco
npm start
```
App opens at http://localhost:3000 (defaults to local mode)

### 5. Test Complete Flow

**A. Create Poll (as Owner):**
1. Go to http://localhost:3000/local/admin
2. Click "**Account #0 (Owner)**"
3. Create poll:
   - Title: "Test Election"
   - Start time: set 2-3 minutes in the future (optional)
   - Duration: 300 (5 minutes)
   - Click "Create Poll"
4. Add candidates:
   - "Alice Johnson"
   - "Bob Smith"
   - "Carol Williams"
5. Authorize voters:
   - Click "**Copy Test Voter Addresses**"
   - Paste and click "Add Voters"

**B. Vote (as Voter):**
1. Go to http://localhost:3000/local/voter
2. Click "**Account #1**"
3. See your poll
4. If the poll is scheduled, wait until it starts
5. Click "Show Candidates & Vote"
6. Vote for a candidate
7. Switch to "**Account #2**" and vote
8. Switch to "**Account #3**" and vote
9. (Optional) Switch to "**Account #4**" and vote

**C. Reveal Results:**
1. Go to http://localhost:3000/local/admin
2. Click "**Account #0 (Owner)**"
3. Wait 5 minutes OR skip time:
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat console --network localhost
```
```javascript
await network.provider.send("evm_increaseTime", [300]);
await network.provider.send("evm_mine");
```
4. Click "Reveal Results" on the poll
5. Go to `/local/voter` and click "Show Results"
6. See the winner!

---

## Switching Between Modes

### Navigation Bar:
- In **Local Mode**: Shows "→ Production Mode" link
- In **Production Mode**: Shows "→ Local Testing" link

### Manual URLs:
- Local: http://localhost:3000/local/voter
- Production: http://localhost:3000/voter

---

## Troubleshooting

### Error: "contract.owner is not a function"

This means the contract isn't deployed or the address is wrong.

**Fix:**
1. Check Hardhat node is running on port 8545
2. Deploy the contract:
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy-and-setup.js --network localhost
```
3. Copy the contract address from the output
4. Update `.env.development`:
```env
REACT_APP_CONTRACT_ADDRESS=<new_address>
```
5. Restart the React app (stop and `npm start` again)

### "Cannot connect to localhost"

**Fix:**
1. Ensure Hardhat node is running: `npx hardhat node`
2. Check `.env.development` has:
```env
REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545
```

### No polls showing up

**Fix:**
1. Make sure you're on `/local/admin` (not `/admin`)
2. Connect with Account #0 first
3. Create a poll
4. Add candidates before authorizing voters

---

## Deploying to Sepolia

When ready for testnet:

1. Deploy to Sepolia:
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy.js --network sepolia
```

2. Update `.env.development`:
```env
REACT_APP_CONTRACT_ADDRESS=<sepolia_contract_address>
REACT_APP_HARDHAT_RPC=<sepolia_rpc_url>
```

3. Use **Production Mode**:
- Go to http://localhost:3000/admin
- Connect MetaMask to Sepolia
- MetaMask will handle all transactions

---

## Environment Variables

**For Local Testing:**
```env
REACT_APP_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545
```

**For Sepolia:**
```env
REACT_APP_CONTRACT_ADDRESS=<your_sepolia_contract>
REACT_APP_HARDHAT_RPC=https://sepolia.infura.io/v3/<your_key>
```

---

## Testing Checklist

### Local Mode (/local/*)
- [ ] Can click Account #0 and connect instantly
- [ ] Can create poll as owner
- [ ] Can add candidates
- [ ] Can copy and add voter addresses
- [ ] Can switch to Account #1 and see authorized polls
- [ ] Can switch to Account #4 and see authorized polls

---

## Automated Tests

Run the UI smoke tests:
```bash
npm test
```
- [ ] Can vote as Account #1
- [ ] Can switch accounts easily
- [ ] Can reveal results after time expires
- [ ] Can see winner

### Production Mode (/admin, /voter)
- [ ] Shows "Connect MetaMask" button only
- [ ] No local account buttons visible
- [ ] MetaMask connection works
- [ ] All features work with MetaMask

---

## Quick Commands Reference

```bash
# Start Hardhat node
cd /Users/ankit/work/git/votingsystem && npx hardhat node

# Deploy with test data
cd /Users/ankit/work/git/votingsystem && npx hardhat run scripts/deploy-and-setup.js --network localhost

# Start React app
cd /Users/ankit/work/git/stunning-disco && npm start

# Skip time (in hardhat console)
await network.provider.send("evm_increaseTime", [300])
await network.provider.send("evm_mine")

# Check contract (in hardhat console)
const Voting = await ethers.getContractFactory("Voting")
const voting = await Voting.attach("<contract_address>")
await voting.pollsCount()
```

---

## Tips

1. **Always use `/local/*` routes for local testing** - No MetaMask setup needed!
2. **Use `/voter` and `/admin` routes when deploying to testnet/mainnet**
3. **The app automatically hides/shows the right buttons** based on the route
4. **Check browser console** for detailed error messages if something fails
5. **Restart React app** after changing `.env.development` files

Happy testing! 🎉
