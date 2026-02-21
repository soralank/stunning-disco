# Quick Start Guide
This project is proprietary and licensed under Ankit Soral's terms. Unauthorized use is prohibited.

**Project Status:** React frontend and smart contract integration are complete. Only a professional security audit is pending.

**License:** Copyright (c) 2026 Ankit Soral. All rights reserved.

For licensing or audit inquiries, contact Ankit Soral.

## What's New

- **Advanced Poll Options:** When creating a poll, admins and franchisees can now enable gasless voting (⛽ Vote Gasless), set tokens-per-voter for token-weighted voting, and enable secret ballot (commit-reveal) mode.
- **Improved Reveal Flow:** Revealing secret ballot votes now gives instant feedback—if the reveal phase is still active, just retry after it ends (no more waiting loop).

Get the Election Voting System running in 5 minutes!

## Terminal 1: Start Blockchain

```bash
cd /Users/ankit/work/git/votingsystem
npm install
npx hardhat node
```

Keep this running. You'll see test accounts with private keys.

## Terminal 2: Deploy Contract

```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy-and-setup.js --network localhost
```

This will:
- Deploy the Voting contract
- Create a sample poll
- Add 3 candidates
- Authorize 3 test voters

Copy the contract address shown at the end.

## Terminal 3: Start React App

```bash
cd /Users/ankit/work/git/stunning-disco
npm install

# Update the contract address in .env.development
echo "REACT_APP_CONTRACT_ADDRESS=<paste_contract_address_here>" > .env.development
echo "REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545" >> .env.development

npm start
```

The app will open at http://localhost:3000

## Configure MetaMask

1. **Add Network**:
   - Network Name: Hardhat Local
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 31337
   - Currency: ETH

2. **Import Test Account**:
   - Copy a private key from Terminal 1 (Hardhat node output)
   - In MetaMask: Account menu → Import Account
   - Paste the private key
   - You now have test ETH!

## Try It Out

### As Owner (Account #0)
1. Go to http://localhost:3000/local/admin
2. Connect wallet
3. You'll see "Owner" badge
4. Create polls (optionally set a start time), add candidates, authorize voters

### As Voter (Account #1, #2, #3, or #4)
1. Import another test account to MetaMask
2. Go to http://localhost:3000/local/voter
3. Connect wallet
4. Vote in authorized polls

### As Admin (Account #1)
1. Import account #1 to MetaMask
2. Can manage the sample poll (when scheduled, wait for start time)
3. Add more candidates or voters
4. Reveal results after voting ends

## Common Commands

### Deploy Fresh Contract
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat run scripts/deploy.js --network localhost
```

### Deploy with Sample Data
```bash
npx hardhat run scripts/deploy-and-setup.js --network localhost
```

### Clear and Restart
```bash
# Stop Hardhat node (Ctrl+C in Terminal 1)
# Start fresh
npx hardhat node
# Re-deploy
npx hardhat run scripts/deploy-and-setup.js --network localhost
# Update .env.development with new address
# Restart React app
```

## Test Scenarios

### Scenario 1: Quick Vote (5 minutes)
1. Owner creates poll with a 300 second duration (optionally set a start time)
2. Owner adds candidates: "Yes", "No", "Abstain"
3. Owner authorizes 5 voters
4. Voters cast votes within 5 minutes
5. After 5 minutes, owner reveals results
6. Everyone sees the winner

### Scenario 2: Organization Election
1. Owner creates poll with 1 hour duration
2. Assign admin to manage the election
3. Admin adds all candidates
4. Admin authorizes voters (bulk import)
5. Voters vote at their convenience
6. After deadline, admin reveals results

## Troubleshooting

### "Transaction Failed"
- Check you're using the right account (owner/admin/voter)
- Ensure poll is still active (check time remaining)
- Verify you haven't already voted

### "Cannot Read Contract"
- Verify contract address in .env.development
- Restart React app after .env changes
- Check Hardhat node is running

### "Insufficient Funds"
- Use a Hardhat test account (has 10000 ETH)
- Import from the private keys shown in Terminal 1

### "Wrong Network"
- MetaMask should show "Hardhat Local" or "Localhost 8545"
- Chain ID must be 31337
- RPC URL: http://127.0.0.1:8545

## What's Next?

See [README.md](README.md) for:
- Complete feature documentation
- Security features
- Contract function reference
- Production deployment guide
- Advanced usage scenarios

## Support

Check these in order:
1. Browser console (F12) for error messages
2. Hardhat node terminal for transaction logs
3. Verify all addresses and configuration
4. Try restarting everything with fresh deployment
