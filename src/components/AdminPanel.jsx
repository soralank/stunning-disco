import React, { useState, useEffect } from 'react';
import { getSigner, getContract, getProvider } from '../contract';
import { ethers } from 'ethers';

// Read from env or use hardcoded defaults
const DEFAULT_ACCOUNTS = [
  { name: 'Account #0 (Owner)', key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
  { name: 'Account #1', key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  { name: 'Account #2', key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
  { name: 'Account #3', key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' },
  { name: 'Account #4', key: '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0', address: '0x2546bcd3c84621e976d8185a91a922ae77ecec30' },

];

let HARDHAT_ACCOUNTS = DEFAULT_ACCOUNTS;
try {
  const envAccounts = process.env.REACT_APP_HARDHAT_ACCOUNTS;
  if (envAccounts) {
    HARDHAT_ACCOUNTS = JSON.parse(envAccounts);
    console.log('Loaded', HARDHAT_ACCOUNTS.length, 'accounts from env');
  }
} catch (e) {
  console.warn('Failed to parse REACT_APP_HARDHAT_ACCOUNTS, using defaults:', e.message);
}

export default function AdminPanel({ mode = 'production' }) {
  const [addr, setAddr] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isPendingOwner, setIsPendingOwner] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState('');
  const [pendingOwner, setPendingOwner] = useState('');
  const [polls, setPolls] = useState([]);
  const [expandedPoll, setExpandedPoll] = useState(null);

  // Create poll form state
  const [pollTitle, setPollTitle] = useState('');
  const [pollAdmin, setPollAdmin] = useState('');
  const [pollStartTime, setPollStartTime] = useState('');
  const [pollDuration, setPollDuration] = useState('3600'); // 1 hour default

  // Add candidate form state
  const [selectedPollId, setSelectedPollId] = useState('');
  const [candidateName, setCandidateName] = useState('');

  // Add voters form state
  const [voterPollId, setVoterPollId] = useState('');
  const [voterAddresses, setVoterAddresses] = useState('');

  // Ownership transfer form state
  const [newOwnerAddress, setNewOwnerAddress] = useState('');

  // Local network state
  const [walletSigner, setWalletSigner] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(0);

  function parseDateTimeAsUtc(value) {
    if (!value) return null;
    const [datePart, timePart] = value.split('T');
    if (!datePart || !timePart) return null;
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    if ([year, month, day, hour, minute].some(Number.isNaN)) return null;
    return Math.floor(Date.UTC(year, month - 1, day, hour, minute, 0) / 1000);
  }

  async function connectWallet() {
    setStatus(null);
    try {
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAddr(address);
      setWalletSigner(null);
      setStatus(`Connected: ${address}`);

      try {
        const contract = getContract(signer);
        const owner = await contract.owner();
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
        await loadOwnership(address);
        await loadPolls();
      } catch (contractErr) {
        setIsOwner(false);
        if (contractErr.message.includes('owner') || contractErr.message.includes('not a function')) {
          setStatus(`Contract Error: Please ensure the contract is deployed. Check contract address in settings.`);
          console.error('Contract error details:', contractErr);
        } else {
          setStatus(`Error: ${contractErr.message}`);
        }
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function connectLocalAccount(accountIndex) {
    setStatus(null);
    try {
      const account = HARDHAT_ACCOUNTS[accountIndex];
      const rpc = process.env.REACT_APP_HARDHAT_RPC || 'http://127.0.0.1:8545';
      const provider = new ethers.JsonRpcProvider(rpc);
      const wallet = new ethers.Wallet(account.key, provider);
      const address = await wallet.getAddress();

      setWalletSigner(wallet);
      setAddr(address);
      setSelectedAccount(accountIndex);
      setStatus(`Connected with ${account.name}: ${address}`);

      try {
        const contract = getContract(wallet);
        const owner = await contract.owner();
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
        await loadOwnership(address);
        await loadPolls();
      } catch (contractErr) {
        setIsOwner(false);
        if (contractErr.message.includes('owner') || contractErr.message.includes('not a function')) {
          setStatus(`Contract Error: Please ensure the contract is deployed at ${process.env.REACT_APP_CONTRACT_ADDRESS || 'the configured address'}. See browser console for details.`);
          console.error('Contract error details:', contractErr);
          console.log('Troubleshooting:');
          console.log('1. Check REACT_APP_CONTRACT_ADDRESS in .env.development');
          console.log('2. Ensure Hardhat node is running: npx hardhat node');
          console.log('3. Deploy contract: npx hardhat run scripts/deploy-and-setup.js --network localhost');
        } else {
          setStatus(`Error: ${contractErr.message}`);
        }
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function loadPolls() {
    console.log('🔄 loadPolls() called...');
    try {
      const provider = getProvider();
      const contract = getContract(provider);
      const nowTs = Math.floor(Date.now() / 1000);
      console.log('Contract address:', contract.target);

      let pollsCount = 0;
      try {
         console.log('✓ getPollsCount() returned:');
        const result = await contract.getPollsCount();
        console.log('✓ getPollsCount() returned:');
        console.log( result);
        pollsCount = Number(result);
        console.log('✅ pollsCount() returned:', pollsCount);
      } catch (e1) {
        console.error(e1);
        console.log('❌ pollsCount() failed:', e1.message);
        // If pollsCount() returns empty data, contract might be at 0 or broken
        if (e1.code === 'BAD_DATA' && e1.value === '0x') {
          console.warn('pollsCount() returned empty data - treating as 0 (no polls yet or wrong contract)');
          pollsCount = 0;
        } else {
          // Try alternative function names
          try {
            const result = await contract.getPollsCount();
            pollsCount = Number(result);
          } catch (e2) {
            try {
              const result = await contract.getPollsCount();
              pollsCount = Number(result);
            } catch (e3) {
              console.error('Cannot read pollsCount from contract');
              console.error('Tried: pollsCount(), getPollsCount(), pollCount()');
              console.error('Last error:', e3.message);
              
              // Check if contract is deployed
              const code = await provider.getCode(contract.target);
              if (code === '0x' || code === '0x0') {
                throw new Error('Contract not deployed at ' + contract.target);
              } else {
                // Contract exists but pollsCount fails - might be at address 0x5FbDB... but wrong contract
                console.error('⚠️ Contract exists but pollsCount() fails');
                console.error('This usually means:');
                console.error('1. Wrong contract address in .env.development');
                console.error('2. Contract needs to be redeployed');
                console.error('3. Hardhat node was restarted (old address invalid)');
                pollsCount = 0; // Treat as no polls
              }
            }
          }
        }
      }

      console.log('Total polls:', pollsCount);
      const pollsData = [];

      for (let i = 1; i <= pollsCount; i++) {
        try {
          const poll = await contract.polls(i);
          
          // Check if poll exists (some contracts return empty data for non-existent polls)
          if (!poll || !poll.exists) {
            console.warn(`Poll #${i} doesn't exist or poll.exists is false`);
            continue;
          }
          
          const optionsCount = await contract.getOptionsCount(i);
          const totalVotes = await contract.getTotalVotes(i);
          const endTime = Number(poll.endTime);
          const startTime = Number(poll.startTime);
          let status;

          try {
            const rawStatus = await contract.getPollStatus(i);
            status = {
              started: rawStatus?.started ?? rawStatus?.[0],
              active: rawStatus?.active ?? rawStatus?.[1],
              ended: rawStatus?.ended ?? rawStatus?.[2],
              revealed: rawStatus?.revealed ?? rawStatus?.[3]
            };
          } catch (statusErr) {
            const activeFallback = await contract.isPollActive(i);
            const startedFallback = startTime ? startTime <= nowTs : activeFallback;
            const endedFallback = poll.ended || (endTime && endTime <= nowTs);
            status = {
              started: startedFallback,
              active: activeFallback,
              ended: endedFallback,
              revealed: poll.revealed
            };
          }

          if (typeof status.started !== 'boolean') {
            status.started = startTime ? startTime <= nowTs : true;
          }
          if (typeof status.ended !== 'boolean') {
            status.ended = poll.ended || (endTime && endTime <= nowTs);
          }
          if (typeof status.revealed !== 'boolean') {
            status.revealed = poll.revealed;
          }
          if (typeof status.active !== 'boolean') {
            status.active = status.started && !status.ended;
          }

          if (startTime && nowTs >= startTime) {
            status.started = true;
          }
          if (endTime && nowTs >= endTime) {
            status.ended = true;
            status.active = false;
          }

          pollsData.push({
            id: i,
            title: poll.title,
            admin: poll.admin,
            startTime,
            endTime,
            revealed: status.revealed,
            ended: status.ended,
            totalVotes: Number(totalVotes),
            optionsCount: Number(optionsCount),
            status
          });
        } catch (pollErr) {
          console.warn(`Failed to load poll #${i}:`, pollErr.message);
          // Continue to next poll
        }
      }

      console.log('📦 Setting polls state with', pollsData.length, 'polls:', pollsData);
      setPolls(pollsData);
      console.log('✅ Polls state updated');

      if (pollsCount === 0) {
        console.log('No polls found. If you expect polls:');
        console.log('1. Check contract address:', contract.target);
        console.log('2. Verify Hardhat node wasn\'t restarted (would invalidate old addresses)');
        console.log('3. Redeploy: npx hardhat run scripts/deploy.js --network localhost');
      }
    } catch (err) {
      console.error('❌ Error loading polls:', err);
      console.error('Error details:', err.message, err);
      setStatus(`Error loading polls: ${err.message}`);
      setPolls([]); // Ensure polls is set to empty array on error
    }
  }

  async function loadOwnership(currentAddress) {
    try {
      const provider = getProvider();
      const contract = getContract(provider);
      const owner = await contract.owner();
      const pending = await contract.pendingOwner();

      setOwnerAddress(owner);
      setPendingOwner(pending);

      if (currentAddress) {
        const currentLower = currentAddress.toLowerCase();
        setIsOwner(owner.toLowerCase() === currentLower);
        setIsPendingOwner(
          pending && pending !== ethers.ZeroAddress && pending.toLowerCase() === currentLower
        );
      } else {
        setIsPendingOwner(false);
      }
    } catch (err) {
      console.error('Error loading ownership:', err);
    }
  }

  async function loadPollDetails(pollId) {
    try {
      const provider = getProvider();
      const contract = getContract(provider);
      const poll = await contract.polls(pollId);
      const optionsCount = await contract.getOptionsCount(pollId);

      const options = [];
      for (let i = 1; i <= Number(optionsCount); i++) {
        const option = await contract.getOption(pollId, i);
        options.push({
          id: Number(option[0]),
          name: option[1],
          votes: Number(option[2])
        });
      }

      return { ...poll, options };
    } catch (err) {
      console.error('Error loading poll details:', err);
      return null;
    }
  }

  async function createPoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!pollTitle) {
        setStatus('Please enter a poll title');
        setLoading(false);
        return;
      }

      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const provider = signer.provider || getProvider();
      const contractAddress = contract.target;

      // STEP 1: Check contract deployment
      console.log('Checking contract at:', contractAddress);
      const code = await provider.getCode(contractAddress);
      
      if (code === '0x' || code === '0x0') {
        setStatus(`❌ NO CONTRACT at ${contractAddress}`);
        console.error('╔══════════════════════════════════════════════════════════╗');
        console.error('║  CONTRACT NOT DEPLOYED - QUICK FIX INSTRUCTIONS          ║');
        console.error('╚══════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('📋 COPY/PASTE THESE COMMANDS:');
        console.log('');
        console.log('# Terminal 1 - Start Hardhat Node:');
        console.log('cd /Users/ankit/work/git/votingsystem && npx hardhat node');
        console.log('');
        console.log('# Terminal 2 - Deploy Contract:');
        console.log('cd /Users/ankit/work/git/votingsystem');
        console.log('npx hardhat run scripts/deploy.js --network localhost');
        console.log('');
        console.log('# Copy the deployed address from output, then:');
        console.log('nano /Users/ankit/work/git/stunning-disco/.env.development');
        console.log('# Update: REACT_APP_CONTRACT_ADDRESS=<your_new_address>');
        console.log('');
        console.log('# Restart frontend:');
        console.log('cd /Users/ankit/work/git/stunning-disco');
        console.log('npm start');
        console.log('');
        console.error('Current config:', process.env.REACT_APP_CONTRACT_ADDRESS);
        setLoading(false);
        return;
      }

      console.log('✓ Contract exists (', code.length, 'bytes )');

      // STEP 2: Verify network
      const network = await provider.getNetwork();
      console.log('✓ Network:', network.chainId, network.name || 'unknown');

      // STEP 3: Test contract ABI with owner() call
      let ownerCheck;
      try {
        ownerCheck = await contract.owner();
        console.log('✓ Contract owner:', ownerCheck);
        console.log('✓ Your address:', await signer.getAddress());
      } catch (abiErr) {
        setStatus(`❌ ABI MISMATCH`);
        console.error('╔══════════════════════════════════════════════════════════╗');
        console.error('║  ABI DOESN\'T MATCH DEPLOYED CONTRACT                     ║');
        console.error('╚══════════════════════════════════════════════════════════╝');
        console.error('Contract exists but owner() call failed:', abiErr.message);
        console.log('');
        console.log('FIXES:');
        console.log('1. Wrong address? Check .env.development');
        console.log('2. Old deployment? Redeploy:');
        console.log('   cd /Users/ankit/work/git/votingsystem && npx hardhat run scripts/deploy.js --network localhost');
        console.log('3. Update ABI: Copy from artifacts and paste into src/contract/abi.json');
        console.log('4. Restart: npm start');
        setLoading(false);
        return;
      }

      const adminAddr = pollAdmin || addr;
      const duration = parseInt(pollDuration);
      const nowTs = Math.floor(Date.now() / 1000);
      const startTs = pollStartTime ? parseDateTimeAsUtc(pollStartTime) : nowTs;

      if (!startTs || Number.isNaN(startTs)) {
        setStatus('Error: Invalid start time');
        setLoading(false);
        return;
      }

      if (!ethers.isAddress(adminAddr)) {
        setStatus('Error: Invalid admin address');
        setLoading(false);
        return;
      }

      if (duration < 1) {
        setStatus('Error: Duration must be at least 1 second');
        setLoading(false);
        return;
      }

      setStatus('Testing transaction...');
      
      // STEP 4: Try staticCall
      try {
        const result = await contract.createPoll.staticCall(pollTitle, adminAddr, startTs, duration);
        console.log('✓ Static call succeeded, will return:', result?.toString());
      } catch (staticErr) {
        const msg = staticErr.message || String(staticErr);
        console.error('Static call failed:', staticErr);
        
        if (msg.includes('Ownable') || msg.includes('caller is not the owner')) {
          setStatus(`Error: Only owner can create polls. Owner: ${ownerCheck}, You: ${addr}`);
        } else if (msg.includes('already exists')) {
          setStatus('Error: Poll title already exists');
        } else if (msg.includes('missing revert data') || msg.includes('CALL_EXCEPTION')) {
          setStatus('Error: Transaction would fail (check console)');
          console.error('This usually means:');
          console.error('- Wrong signer (not owner)');
          console.error('- Contract has a require() that fails');
          console.error('- Insufficient gas (unlikely on local)');
        } else {
          setStatus(`Error: ${msg}`);
        }
        setLoading(false);
        return;
      }

      // STEP 5: Send real transaction
      setStatus('Submitting transaction...');
      const tx = await contract.createPoll(pollTitle, adminAddr, startTs, duration);
      
      setStatus('Waiting for confirmation...');
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed.name === 'PollCreated';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const pollId = parsed.args[0];
        setStatus(`✅ Poll created! ID: ${pollId}`);
      } else {
        setStatus('✅ Poll created successfully!');
      }

      setPollTitle('');
      setPollAdmin('');
      setPollStartTime('');
      setPollDuration('3600');
      await loadPolls();
      
    } catch (err) {
      console.error('Create poll error:', err);
      const message = err.message || String(err);
      
      if (message.includes('missing revert data') || message.includes('CALL_EXCEPTION')) {
        setStatus('❌ Transaction failed - See console for fix instructions');
      } else {
        setStatus(`Error: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addCandidate(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!selectedPollId || !candidateName) {
        setStatus('Please select a poll and enter candidate name');
        setLoading(false);
        return;
      }

      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Adding candidate...');
      const tx = await contract.addOptionToPoll(selectedPollId, candidateName);
      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus(`Candidate "${candidateName}" added successfully!`);
      setCandidateName('');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function addVoters(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!voterPollId || !voterAddresses) {
        setStatus('Please select a poll and enter voter addresses');
        setLoading(false);
        return;
      }

      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      const addresses = voterAddresses
        .split(',')
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0);

      if (addresses.length === 0) {
        setStatus('No valid addresses provided');
        setLoading(false);
        return;
      }

      setStatus(`Adding ${addresses.length} voter(s)...`);

      if (addresses.length === 1) {
        const tx = await contract.addVoter(voterPollId, addresses[0]);
        await tx.wait();
      } else {
        const tx = await contract.addVoters(voterPollId, addresses);
        await tx.wait();
      }

      setStatus(`${addresses.length} voter(s) added successfully!`);
      setVoterAddresses('');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function startOwnershipTransfer(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!newOwnerAddress || !ethers.isAddress(newOwnerAddress)) {
        setStatus('Error: Invalid new owner address');
        setLoading(false);
        return;
      }

      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Starting ownership transfer...');
      const tx = await contract.transferOwnership(newOwnerAddress);
      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus(`Ownership transfer started. Pending owner: ${newOwnerAddress}`);
      setNewOwnerAddress('');
      await loadOwnership(addr);
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function cancelOwnershipTransfer() {
    setStatus(null);
    setLoading(true);

    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Canceling ownership transfer...');
      const tx = await contract.cancelOwnershipTransfer();
      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus('Ownership transfer canceled.');
      await loadOwnership(addr);
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function acceptOwnership() {
    setStatus(null);
    setLoading(true);

    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Accepting ownership...');
      const tx = await contract.acceptOwnership();
      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus('Ownership accepted successfully.');
      await loadOwnership(addr);
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function revealResults(pollId) {
    setStatus(null);
    setLoading(true);

    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Revealing results...');
      const tx = await contract.revealResults(pollId);
      await tx.wait();

      setStatus('Results revealed successfully!');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function endPoll(pollId) {
    setStatus(null);
    setLoading(true);

    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Ending poll...');
      const tx = await contract.endPoll(pollId);
      await tx.wait();

      setStatus('Poll ended successfully!');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function togglePollDetails(pollId) {
    if (expandedPoll === pollId) {
      setExpandedPoll(null);
    } else {
      const details = await loadPollDetails(pollId);
      if (details) {
        setPolls(polls.map(p => p.id === pollId ? { ...p, options: details.options } : p));
      }
      setExpandedPoll(pollId);
    }
  }

  function copyVoterAddresses() {
    const addresses = HARDHAT_ACCOUNTS.slice(1, 5).map(acc => acc.address).join(',');
    navigator.clipboard.writeText(addresses);
    setStatus('Copied voter addresses to clipboard!');
    setTimeout(() => setStatus(null), 2000);
  }

  useEffect(() => {
    if (addr) {
      loadOwnership(addr);
      let pollInterval;

      const startPolling = () => {
        if (document.visibilityState !== 'visible') return;
        loadPolls();
        pollInterval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            loadPolls();
          }
        }, 30000);
      };

      const stopPolling = () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      const handleVisibility = () => {
        stopPolling();
        startPolling();
      };

      startPolling();
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        stopPolling();
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [addr]);

  const formatTimeRemaining = (endTime) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = endTime - now;

    if (remaining <= 0) return 'Ended';

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
    return `${seconds}s remaining`;
  };

  const formatTimeUntil = (time) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = time - now;

    if (remaining <= 0) return 'Starting soon';

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
    if (minutes > 0) return `Starts in ${minutes}m ${seconds}s`;
    return `Starts in ${seconds}s`;
  };

  const formatDateTime = (time) => {
    if (!time) return 'Not set';
    return new Date(time * 1000).toLocaleString();
  };

  const voterPath = mode === 'local' ? '/local/voter' : '/voter';

  return (
    <div className="admin-panel">
      {status && (
        <div className={`status-banner ${status.includes('Error') ? 'status-error' : 'status-success'}`}>
          {status}
        </div>
      )}

      <div className="panel-grid">
        <section className="panel-card">
          <div className="panel-head">
            <h3>Connection</h3>
            {addr && (
              <span className="address-pill">
                {addr} {isOwner && '(Owner)'}
              </span>
            )}
          </div>

          {mode === 'local' ? (
            <div>
              <div className="muted">Select a test account (no MetaMask needed).</div>
              <div className="account-grid">
                {HARDHAT_ACCOUNTS.map((account, index) => (
                  <button
                    key={index}
                    className={`btn secondary ${selectedAccount === index && walletSigner ? 'is-active' : ''}`}
                    onClick={() => connectLocalAccount(index)}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button className="btn" onClick={connectWallet}>
              {addr ? 'Reconnect MetaMask' : 'Connect MetaMask Wallet'}
            </button>
          )}
        </section>

        {addr && isOwner && (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Ownership</h3>
              <span className="chip">{isOwner ? 'Owner' : isPendingOwner ? 'Pending' : 'Viewer'}</span>
            </div>
            <div className="meta-list">
              <div>
                <span>Current owner</span>
                <strong>{ownerAddress || 'Unknown'}</strong>
              </div>
              <div>
                <span>Pending owner</span>
                <strong>{pendingOwner && pendingOwner !== ethers.ZeroAddress ? pendingOwner : 'None'}</strong>
              </div>
            </div>

            {isOwner && (
              <form onSubmit={startOwnershipTransfer} className="form-stack">
                <input
                  type="text"
                  placeholder="New Owner Address"
                  value={newOwnerAddress}
                  onChange={e => setNewOwnerAddress(e.target.value)}
                  className="form-input"
                />
                <div className="form-actions">
                  <button type="submit" className="btn" disabled={loading}>
                    {loading ? 'Submitting...' : 'Start Transfer'}
                  </button>
                  {pendingOwner && pendingOwner !== ethers.ZeroAddress && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={cancelOwnershipTransfer}
                      disabled={loading}
                    >
                      {loading ? 'Canceling...' : 'Cancel Transfer'}
                    </button>
                  )}
                </div>
              </form>
            )}

            {pendingOwner && pendingOwner !== ethers.ZeroAddress && (
              <div className="form-actions">
                <button className="btn" onClick={acceptOwnership} disabled={loading || !isPendingOwner}>
                  {loading ? 'Accepting...' : 'Accept Ownership'}
                </button>
                {!isPendingOwner && (
                  <div className="muted small">Connect with the pending owner address to accept ownership.</div>
                )}
              </div>
            )}
          </section>
        )}

        {addr && isOwner && (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Create New Poll</h3>
              <span className="chip">Owner only</span>
            </div>
            <form onSubmit={createPoll} className="form-stack">
              <input
                type="text"
                placeholder="Poll Title"
                value={pollTitle}
                onChange={e => setPollTitle(e.target.value)}
                className="form-input"
              />
              <input
                type="text"
                placeholder="Admin Address (leave empty to use your address)"
                value={pollAdmin}
                onChange={e => setPollAdmin(e.target.value)}
                className="form-input"
              />
              <input
                type="datetime-local"
                value={pollStartTime}
                onChange={e => setPollStartTime(e.target.value)}
                className="form-input"
              />
              <div className="muted small">Leave blank to start immediately. Time is interpreted as UTC.</div>
              <input
                type="number"
                placeholder="Duration (seconds)"
                value={pollDuration}
                onChange={e => setPollDuration(e.target.value)}
                className="form-input"
              />
              <div className="muted small">Suggested: 300 (5 min), 3600 (1 hour), 86400 (1 day)</div>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Creating...' : 'Create Poll'}
              </button>
            </form>
          </section>
        )}

        {addr && isOwner && polls.length > 0 && (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Add Candidate</h3>
            </div>
            <form onSubmit={addCandidate} className="form-stack">
              <select
                value={selectedPollId}
                onChange={e => setSelectedPollId(e.target.value)}
                className="form-input"
              >
                <option value="">Select Poll</option>
                {polls.filter(p => !p.ended).map(poll => (
                  <option key={poll.id} value={poll.id}>
                    Poll #{poll.id}: {poll.title}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Candidate Name"
                value={candidateName}
                onChange={e => setCandidateName(e.target.value)}
                className="form-input"
              />
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Adding...' : 'Add Candidate'}
              </button>
            </form>
          </section>
        )}

        {addr && isOwner && polls.length > 0 && (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Add Voters</h3>
            </div>
            <form onSubmit={addVoters} className="form-stack">
              <select
                value={voterPollId}
                onChange={e => setVoterPollId(e.target.value)}
                className="form-input"
              >
                <option value="">Select Poll</option>
                {polls.filter(p => !p.ended).map(poll => (
                  <option key={poll.id} value={poll.id}>
                    Poll #{poll.id}: {poll.title}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Voter Addresses (comma-separated)"
                value={voterAddresses}
                onChange={e => setVoterAddresses(e.target.value)}
                rows={4}
                className="form-input form-textarea"
              />
              {mode === 'local' && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={copyVoterAddresses}
                >
                  Copy Test Voter Addresses (Accounts #1, #2, #3, #4)
                </button>
              )}
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Adding...' : 'Add Voters'}
              </button>
            </form>
          </section>
        )}
      </div>

      {addr && isOwner && polls.length > 0 && (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>Manage Polls</h3>
          </div>
          <div className="poll-grid">
            {polls.map(poll => {
              const nowTs = Math.floor(Date.now() / 1000);
              const status = poll.status || { started: true, active: false, ended: poll.ended, revealed: poll.revealed };
              const isUpcoming = !status.started && poll.startTime && nowTs < poll.startTime;
              const statusLabel = status.revealed
                ? 'Revealed'
                : status.ended
                ? 'Ended'
                : status.active
                ? 'Active'
                : isUpcoming
                ? 'Scheduled'
                : 'Expired';
              const timeLabel = isUpcoming ? formatTimeUntil(poll.startTime) : formatTimeRemaining(poll.endTime);

              return (
                <div
                  key={poll.id}
                  className={`poll-card ${poll.isActive ? 'is-active' : ''} ${poll.ended ? 'is-ended' : ''}`}
                >
                  <div className="poll-card__head">
                    <div>
                      <h4 className="poll-title">Poll #{poll.id}: {poll.title}</h4>
                      <div className="muted small">Admin: {poll.admin}</div>
                    </div>
                    <span className="chip">
                      {statusLabel}
                    </span>
                  </div>
                  <div className="poll-meta">
                    <div>
                      <span>Status</span>
                      <strong>{timeLabel}</strong>
                    </div>
                    <div>
                      <span>Starts</span>
                      <strong>{formatDateTime(poll.startTime)}</strong>
                    </div>
                    <div>
                      <span>Ends</span>
                      <strong>{formatDateTime(poll.endTime)}</strong>
                    </div>
                    <div>
                      <span>Candidates</span>
                      <strong>{poll.optionsCount}</strong>
                    </div>
                    <div>
                      <span>Total votes</span>
                      <strong>{poll.totalVotes}</strong>
                    </div>
                    <div>
                      <span>Results</span>
                      <strong>{poll.revealed ? 'Revealed' : 'Hidden'}</strong>
                    </div>
                  </div>
                  <div className="poll-actions">
                    <button
                      className="btn secondary"
                      onClick={() => togglePollDetails(poll.id)}
                    >
                      {expandedPoll === poll.id ? 'Hide Details' : 'Show Details'}
                    </button>
                    {status.ended && !status.revealed && (
                      <button
                        className="btn"
                        onClick={() => revealResults(poll.id)}
                        disabled={loading}
                      >
                        Reveal Results
                      </button>
                    )}
                    {status.active && (
                      <button
                        className="btn"
                        onClick={() => endPoll(poll.id)}
                        disabled={loading}
                      >
                        End Poll
                      </button>
                    )}
                  </div>

                  {expandedPoll === poll.id && poll.options && (
                    <div className="poll-options">
                      <h5>Candidates</h5>
                      {poll.options.map(option => (
                        <div key={option.id} className="option-row">
                          <span>{option.name}</span>
                          <span className="option-votes">
                            {poll.revealed ? `${option.votes} votes` : '?'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {addr && isOwner && polls.length === 0 && (
        <div className="empty-state">
          No polls created yet. {isOwner && 'Create your first poll above!'}
        </div>
      )}

      {addr && !isOwner && (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>Admin Access</h3>
            <span className="chip">Owner only</span>
          </div>
          <div className="status-banner status-warning">
            This section is available only to the contract owner. Switch to the owner account or use the voter page at{' '}
            <a href={voterPath}>{voterPath}</a>.
          </div>
        </section>
      )}
    </div>
  );
}
