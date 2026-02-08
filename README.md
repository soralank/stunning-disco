# Election Voting System

A decentralized election voting system built with React and Solidity smart contracts. This application provides a complete voting platform with admin controls, voter authorization, time-based voting, and result management.

## Features

- **Owner Controls**: Contract owner can create polls and assign administrators
- **Admin Functions**:
  - Create polls with custom duration
   - Schedule poll start time
  - Add candidates/options to polls
  - Authorize voters (single or bulk)
  - Reveal results after voting ends
  - End polls permanently
- **Voter Features**:
  - View authorized polls
  - Cast one vote per poll
  - View results after they are revealed
  - See winner when results are revealed
- **Trusted System**:
  - Only authorized voters can vote
  - One vote per person per poll
  - Time-based voting periods
  - Results hidden until revealed by admin
  - Immutable on-chain voting records

## Prerequisites

- Node.js (v14 or later)
- MetaMask browser extension or compatible Web3 wallet
- Hardhat (for local blockchain testing)

## Setup Instructions

### 1. Deploy the Smart Contract

First, deploy the Voting contract from your Solidity project:

```bash
cd /Users/ankit/work/git/votingsystem

# Install dependencies (if not already done)
npm install

# Start a local Hardhat node (in a separate terminal)
npx hardhat node

# Deploy the contract (in another terminal)
npx hardhat run scripts/deploy.js --network localhost
```

After deployment, note the contract address. You'll need it for the frontend configuration.

### 2. Configure the React App

```bash
cd /Users/ankit/work/git/stunning-disco

# Install dependencies
npm install

# Copy the example environment file
cp .env.example .env.development

# Edit .env.development and set the contract address
# REACT_APP_CONTRACT_ADDRESS=<your_deployed_contract_address>
```

Update [.env.development](.env.development) with your deployed contract address:

```env
REACT_APP_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545
```

### 3. Start the Application

```bash
npm start
```

The application will open at [http://localhost:3000](http://localhost:3000)

## Usage Guide

### For Contract Owners

1. **Connect Wallet**: Click "Connect Wallet" on the Admin page
2. **Create a Poll**:
   - Enter a poll title (e.g., "2024 Election")
   - Optionally specify an admin address (leave blank to use your address)
   - Optionally set a start time (leave blank to start immediately)
   - Set duration in seconds (e.g., 3600 for 1 hour)
   - Click "Create Poll"
3. **Add Candidates**:
   - Select the poll from the dropdown
   - Enter candidate names one by one
   - Click "Add Candidate"
4. **Authorize Voters**:
   - Select the poll
   - Enter voter addresses (comma-separated for multiple)
   - Click "Add Voters"
5. **Manage Poll**:
   - View poll status and details
   - After time expires, click "Reveal Results"
   - Optionally click "End Poll" to permanently close it

### For Voters

1. **Connect Wallet**: Click "Connect Wallet to Vote"
2. **View Your Polls**: See all polls where you're authorized to vote
3. **Cast Your Vote**:
   - Click "Show Candidates & Vote" on an active poll
   - Review the candidates
   - Click "Vote" next to your chosen candidate
   - Confirm the transaction in MetaMask
4. **View Results**: After admin reveals results, click "Show Results" to see vote counts and the winner

## Contract Functions

### Owner Functions
- `createPoll(title, admin, startTime, durationSeconds)` - Create a new poll (start time is a unix timestamp)
- `transferOwnership(newOwner)` - Transfer contract ownership

### Admin/Owner Functions
- `addOptionToPoll(pollId, name)` - Add a candidate to a poll
- `addVoter(pollId, voter)` - Authorize a single voter
- `addVoters(pollId, voters[])` - Authorize multiple voters
- `removeVoter(pollId, voter)` - Remove voter authorization
- `revealResults(pollId)` - Make results public
- `endPoll(pollId)` - Permanently end a poll

### Voter Functions
- `voteInPoll(pollId, optionId)` - Cast a vote

### View Functions
- `polls(pollId)` - Get poll details
- `getOption(pollId, optionId)` - Get candidate details
- `isVoterAuthorized(pollId, voter)` - Check voter authorization
- `hasVoterVoted(pollId, voter)` - Check if voter has voted
- `isPollActive(pollId)` - Check if poll is active
- `getWinner(pollId)` - Get winning candidate
- `getTotalVotes(pollId)` - Get total votes cast

## Development Configuration

### Using Local Hardhat Network

1. Start Hardhat node:
```bash
cd /Users/ankit/work/git/votingsystem
npx hardhat node
```

2. The node provides test accounts with private keys. You can:
   - Import accounts into MetaMask using the private keys
   - Or use the built-in local key feature in the Admin panel for development

### Network Configuration

Connect MetaMask to your local network:
- Network Name: Localhost 8545
- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337
- Currency Symbol: ETH

## Architecture

```
/Users/ankit/work/git/stunning-disco/
├── src/
│   ├── components/
│   │   ├── AdminPanel.jsx      # Admin controls for managing polls
│   │   ├── VoteList.jsx         # Voter interface for casting votes
│   │   └── Layout.jsx           # App layout with navigation
│   ├── pages/
│   │   ├── AdminPage.jsx        # Admin page wrapper
│   │   └── VoterPage.jsx        # Voter page wrapper
│   ├── contract/
│   │   ├── index.js             # Web3 provider and contract setup
│   │   └── abi.json             # Contract ABI
│   └── App.jsx                  # Main app router
└── package.json

/Users/ankit/work/git/votingsystem/
├── contracts/
│   ├── Voting.sol               # Main voting contract
│   ├── ElectionsManager.sol     # Core election logic
│   └── Ownable.sol              # Ownership management
└── hardhat.config.ts
```

## Smart Contract Details

The voting system uses the `Voting` contract which inherits from `ElectionsManager`:

- **Poll Creation**: Only owner can create polls with specified admin and duration
- **Voter Authorization**: Admin or owner can authorize specific addresses to vote
- **One Vote Per Person**: Contract enforces single vote per address per poll
- **Time-Based Voting**: Polls have start and end times
- **Result Privacy**: Results are hidden until admin reveals them
- **Immutable Records**: All votes are recorded on-chain permanently

## Security Features

- Only authorized voters can vote
- Owner/admin role separation
- Time-locked voting periods
- One vote per address enforcement
- No duplicate poll titles
- No duplicate candidate names within a poll
- Results hidden until explicitly revealed
- Cannot vote after time expires
- Cannot modify polls after they end

## Troubleshooting

### Contract Connection Issues
- Ensure Hardhat node is running on port 8545
- Verify contract address in `.env.development` is correct
- Check MetaMask is connected to the correct network

### Transaction Failures
- Ensure you have sufficient ETH for gas fees
- Check you're using the correct account (owner/admin/voter)
- Verify the poll is still active (for voting)
- Confirm you haven't already voted (for voting)

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
npm start
```

## Common Use Cases

### Running a Quick Election

1. Owner creates poll: `createPoll("Quick Vote", ownerAddress, 300)` (5 minutes)
2. Owner adds candidates: "Candidate A", "Candidate B", "Candidate C"
3. Owner authorizes voters: `addVoters(1, [voter1, voter2, voter3])`
4. Voters cast their votes within 5 minutes
5. After 5 minutes, owner reveals results: `revealResults(1)`
6. Everyone can see the winner

### Organization-Wide Election

1. Owner creates poll with designated admin
2. Admin adds all candidates
3. Admin bulk-imports voter list (comma-separated addresses)
4. Set longer duration (e.g., 86400 for 24 hours)
5. Voters cast votes at their convenience
6. After deadline, admin reveals results
7. Admin ends poll to finalize

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify all configuration in `.env.development`
3. Ensure smart contract is deployed and accessible
4. Check MetaMask connection and network settings

## License

This project is provided as-is for educational and election management purposes.
