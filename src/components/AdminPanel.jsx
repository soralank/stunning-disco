import React, { useState, useEffect, useMemo } from 'react';
import { getSigner, getContract, getProvider, getContractErrorDetails, sendTxWithNonceRetry, getSecretBallotManagerContract, getFranchiseManagerContract } from '../contract';
import { ethers } from 'ethers';
import Pagination from './Pagination';
import SearchBar from './SearchBar';

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

export default function AdminPanel({ mode = 'production', role }) {
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
  const [pollDuration, setPollDuration] = useState('3600');
  const [pollRevealDuration, setPollRevealDuration] = useState('60'); // 1 hour default
  const [enableTokenVoting, setEnableTokenVoting] = useState(false);
  const [requireTokenVoting, setRequireTokenVoting] = useState(false);
  const [tokensPerVoter, setTokensPerVoter] = useState('1');
  const [allowGaslessVoting, setAllowGaslessVoting] = useState(false);

  // Per-poll custom manager addresses (advanced)
  const [customTokenManager, setCustomTokenManager] = useState('');
  const [customVotingPaymaster, setCustomVotingPaymaster] = useState('');

  // Add candidate form state
  const [selectedPollId, setSelectedPollId] = useState('');
  const [candidateName, setCandidateName] = useState('');

  // Add voters form state
  const [voterPollId, setVoterPollId] = useState('');
  const [voterAddresses, setVoterAddresses] = useState('');
  const [voterTokensPerVoter, setVoterTokensPerVoter] = useState('1');
  const [topUpPollId, setTopUpPollId] = useState('');
  const [topUpVoterAddresses, setTopUpVoterAddresses] = useState('');
  const [topUpAmountPerVoter, setTopUpAmountPerVoter] = useState('1');
  const [balanceCheckPollId, setBalanceCheckPollId] = useState('');
  const [balanceCheckVoterAddress, setBalanceCheckVoterAddress] = useState('');
  const [balanceCheckResult, setBalanceCheckResult] = useState(null);

  // Ownership transfer form state
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [paymasterAddress, setPaymasterAddress] = useState('');
  const [paymasterStatus, setPaymasterStatus] = useState({
    configured: false,
    deployed: false,
    chainId: null,
    networkName: 'unknown'
  });

  // Local network state
  const [walletSigner, setWalletSigner] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(0);

  // Secret ballot / Quadratic / Multi-choice per-poll state
  const [secretBallotPollId, setSecretBallotPollId] = useState('');
  const [revealDurationMinutes, setRevealDurationMinutes] = useState('60');
  const [quadraticPollId, setQuadraticPollId] = useState('');
  const [multiChoicePollId, setMultiChoicePollId] = useState('');
  const [maxChoices, setMaxChoices] = useState('3');
  const [delegationPollId, setDelegationPollId] = useState('');
  const [metadataPollId, setMetadataPollId] = useState('');
  const [metadataURI, setMetadataURI] = useState('');
  const [removeVoterPollId, setRemoveVoterPollId] = useState('');
  const [removeVoterAddress, setRemoveVoterAddress] = useState('');
  const [sbmAddress, setSbmAddress] = useState('');
  const [tokenMgrAddress, setTokenMgrAddress] = useState('');
  const [infraLocked, setInfraLocked] = useState(false);

  // Franchise state
  const [franchises, setFranchises] = useState([]);
  const [grantFranchisee, setGrantFranchisee] = useState('');
  const [grantDuration, setGrantDuration] = useState('2592000'); // 30 days
  const [grantMaxPolls, setGrantMaxPolls] = useState('10');
  const [grantFeePerPoll, setGrantFeePerPoll] = useState('0');
  const [grantPaymaster, setGrantPaymaster] = useState('');
  const [transferFee, setTransferFee] = useState('0');
  const [newTransferFee, setNewTransferFee] = useState('');
  const [fmBalance, setFmBalance] = useState('0');
  const [franchiseManagerAddr, setFranchiseManagerAddr] = useState('');
  const [addPollsFranchiseId, setAddPollsFranchiseId] = useState('');
  const [addPollsCount, setAddPollsCount] = useState('');
  const [fmAddrInput, setFmAddrInput] = useState('');
  // Franchisee-specific state
  const [isFranchisee, setIsFranchisee] = useState(false);
  const [myFranchiseId, setMyFranchiseId] = useState(0);
  const [myFranchise, setMyFranchise] = useState(null);
  const [fpTitle, setFpTitle] = useState('');
  const [fpStartTime, setFpStartTime] = useState('');
  const [fpDuration, setFpDuration] = useState('3600');
  const [fpEnableToken, setFpEnableToken] = useState(false);
  const [fpRequireToken, setFpRequireToken] = useState(false);
  const [transferToAddress, setTransferToAddress] = useState('');

  // Search, pagination, and duplicate name checking state
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardFilter, setDashboardFilter] = useState('all'); // all | active | ended | revealed
  const [dashboardPage, setDashboardPage] = useState(1);
  const [dashboardPageSize, setDashboardPageSize] = useState(10);
  const [franchiseSearch, setFranchiseSearch] = useState('');
  const [franchisePage, setFranchisePage] = useState(1);
  const [franchisePageSize, setFranchisePageSize] = useState(10);
  const [existingPollNames, setExistingPollNames] = useState([]);
  const [titleDuplicateWarning, setTitleDuplicateWarning] = useState('');
  const [fpTitleDuplicateWarning, setFpTitleDuplicateWarning] = useState('');

  // ─── Load existing poll names for duplicate prevention ──────────────────
  async function loadExistingPollNames(explicitProvider) {
    try {
      const provider = getEffectiveProvider ? getEffectiveProvider(explicitProvider) : (explicitProvider || getProvider());
      const contract = getContract(provider);
      let pollsCount = 0;
      try { pollsCount = Number(await contract.getPollsCount()); } catch {
        try { pollsCount = Number(await contract.pollsCount()); } catch { return; }
      }
      const names = [];
      for (let i = 1; i <= pollsCount; i++) {
        try {
          const poll = await contract.polls(i);
          if (poll && poll.title) names.push(poll.title);
        } catch { }
      }
      setExistingPollNames(names);
    } catch (err) {
      console.warn('Could not load existing poll names:', err.message);
    }
  }

  // Check title for duplicates using on-chain pollTitles mapping + local cache
  async function checkTitleDuplicate(title, setWarningFn) {
    if (!title || !title.trim()) { setWarningFn(''); return; }
    const trimmed = title.trim();
    // Fast local check first
    const localMatch = existingPollNames.find(n => n.toLowerCase() === trimmed.toLowerCase());
    if (localMatch) {
      setWarningFn(`"${localMatch}" already exists. The contract will reject duplicate titles.`);
      return;
    }
    // Also try the on-chain pollTitles(string) mapping for definitive answer
    try {
      const provider = getEffectiveProvider ? getEffectiveProvider() : getProvider();
      const contract = getContract(provider);
      const exists = await contract.pollTitles(trimmed);
      if (exists) {
        setWarningFn(`"${trimmed}" already exists on-chain. Choose a different title.`);
        return;
      }
    } catch { /* pollTitles not available, rely on local cache */ }
    setWarningFn('');
  }

  function parseDateTimeLocalToUnix(value) {
    if (!value) return null;
    const [datePart, timePart] = value.split('T');
    if (!datePart || !timePart) return null;

    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    if ([year, month, day, hour, minute].some(Number.isNaN)) return null;

    const localDate = new Date(year, month - 1, day, hour, minute, 0);
    if (Number.isNaN(localDate.getTime())) return null;
    return Math.floor(localDate.getTime() / 1000);
  }

  function formatUtcDateTime(ts) {
    if (!ts) return null;
    return new Date(ts * 1000).toISOString().replace('.000Z', ' UTC').replace('T', ' ');
  }

  function formatLocalUtcOffset(ts) {
    if (!ts) return null;
    const localDate = new Date(ts * 1000);
    const offsetMinutes = -localDate.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const minutes = String(absMinutes % 60).padStart(2, '0');
    return `UTC${sign}${hours}:${minutes}`;
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
        // Pass wallet.provider explicitly since walletSigner state hasn't updated yet
        const contract = getContract(wallet);
        const owner = await contract.owner();
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
        await loadOwnership(address, wallet.provider);
        await loadPolls(wallet.provider);
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

  // Use local wallet signer's provider when available (avoids MetaMask intercepting calls in local mode)
  // Accept an optional explicit provider to avoid stale React state during connect flows.
  function getEffectiveProvider(explicitProvider) {
    return explicitProvider || walletSigner?.provider || getProvider();
  }

  async function loadPolls(explicitProvider) {
    console.log('🔄 loadPolls() called...');
    try {
      const provider = getEffectiveProvider(explicitProvider);
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
            const result = await contract.pollsCount();
            pollsCount = Number(result);
          } catch (e2) {
            try {
              const result = await contract.pollCount();
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
          let tokenConfig = {
            enabled: false,
            tokenRequired: false,
            tokensPerVoter: 0,
            allowGaslessVoting: false
          };

          try {
            const rawTokenConfig = await contract.getTokenConfig(i);
            tokenConfig = {
              enabled: rawTokenConfig?.enabled ?? rawTokenConfig?.[0] ?? false,
              tokenRequired: rawTokenConfig?.tokenRequired ?? rawTokenConfig?.[1] ?? false,
              tokensPerVoter: Number(rawTokenConfig?.tokensPerVoter ?? rawTokenConfig?.[2] ?? 0),
              allowGaslessVoting: rawTokenConfig?.allowGaslessVoting ?? rawTokenConfig?.[3] ?? false
            };
          } catch {
          }

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

          const pollData = {
            id: i,
            title: poll.title,
            admin: poll.admin,
            startTime,
            endTime,
            revealed: status.revealed,
            ended: status.ended,
            totalVotes: Number(totalVotes),
            optionsCount: Number(optionsCount),
            tokenConfig,
            status
          };

          // Load options for revealed polls (so vote counts are always fresh)
          if (status.revealed) {
            const options = [];
            for (let j = 1; j <= Number(optionsCount); j++) {
              const option = await contract.getOption(i, j);
              options.push({
                id: Number(option[0]),
                name: option[1],
                votes: Number(option[2])
              });
            }
            pollData.options = options;
          }

          pollsData.push(pollData);

          // Augment with new feature flags (best-effort)
          const lastPoll = pollsData[pollsData.length - 1];
          try { lastPoll.isSecretBallot = await contract.secretBallot(i); } catch { lastPoll.isSecretBallot = false; }
          if (lastPoll.isSecretBallot) {
            try {
              const sbm = getSecretBallotManagerContract(provider);
              lastPoll.revealDuration = Number(await sbm.getRevealDuration(i));
              lastPoll.commitCount = Number(await sbm.commitCount(i));
            } catch {
              lastPoll.revealDuration = 3600;
              lastPoll.commitCount = 0;
            }
          }
          try { lastPoll.quadraticEnabled = await contract.quadraticVotingEnabled(i); } catch { lastPoll.quadraticEnabled = false; }
          try { lastPoll.maxChoices = Number(await contract.pollMaxChoices(i)); } catch { lastPoll.maxChoices = 0; }
          try { lastPoll.delegationEnabled = await contract.delegationEnabled(i); } catch { lastPoll.delegationEnabled = false; }
          try { lastPoll.metadataURI = await contract.getPollMetadata(i); } catch { lastPoll.metadataURI = ''; }
        } catch (pollErr) {
          console.warn(`Failed to load poll #${i}:`, pollErr.message);
          // Continue to next poll
        }
      }

      console.log('📦 Setting polls state with', pollsData.length, 'polls:', pollsData);
      setPolls(pollsData);
      setExistingPollNames(pollsData.map(p => p.title));
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

  async function loadOwnership(currentAddress, explicitProvider) {
    try {
      const provider = getEffectiveProvider(explicitProvider);
      const contract = getContract(provider);
      const owner = await contract.owner();
      const pending = await contract.pendingOwner();
      const network = await provider.getNetwork();
      let paymaster = ethers.ZeroAddress;
      let nextPaymasterStatus = {
        configured: false,
        deployed: false,
        chainId: Number(network?.chainId),
        networkName: network?.name || 'unknown'
      };

      try {
        paymaster = await contract.votingPaymaster();
      } catch {
      }

      if (paymaster && paymaster !== ethers.ZeroAddress) {
        nextPaymasterStatus.configured = true;
        try {
          const code = await provider.getCode(paymaster);
          nextPaymasterStatus.deployed = code !== '0x' && code !== '0x0';
        } catch {
          nextPaymasterStatus.deployed = false;
        }
      }

      setOwnerAddress(owner);
      setPendingOwner(pending);
      setPaymasterAddress(paymaster && paymaster !== ethers.ZeroAddress ? paymaster : '');
      setPaymasterStatus(nextPaymasterStatus);

      // Load infrastructure lock status
      try {
        const locked = await contract.infrastructureLocked();
        setInfraLocked(locked);
      } catch { }

      // Load current SBM address
      try {
        const currentSbm = await contract.secretBallotMgr();
        if (currentSbm && currentSbm !== ethers.ZeroAddress) {
          setSbmAddress(currentSbm);
        }
      } catch { }

      // Load current TokenManager address
      try {
        const currentTm = await contract.tokenManager();
        if (currentTm && currentTm !== ethers.ZeroAddress) {
          setTokenMgrAddress(currentTm);
        }
      } catch { }

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
      const provider = getEffectiveProvider();
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
      // If secret ballot is enabled, we need extra buffer time to set reveal duration
      const hasSecretBallot = Number(pollRevealDuration) > 0;
      // Increase buffer to 90 seconds for secret ballot to ensure we can set reveal duration
      const defaultBuffer = hasSecretBallot ? 90 : (mode === 'local' ? 15 : 60);
      let startTs = pollStartTime ? parseDateTimeLocalToUnix(pollStartTime) : (nowTs + defaultBuffer);

      if (!startTs || Number.isNaN(startTs)) {
        setStatus('Error: Invalid start time');
        setLoading(false);
        return;
      }

      // Ensure start time is at least a few seconds in the future (contract requirement)
      // For secret ballot, need at least 60s buffer to set reveal duration
      const minBuffer = hasSecretBallot ? 60 : 5;
      if (startTs <= nowTs + minBuffer) {
        startTs = nowTs + (hasSecretBallot ? 90 : defaultBuffer);
        console.log('Start time adjusted to', startTs, `(now + ${hasSecretBallot ? 90 : defaultBuffer}s) to meet contract requirement`);
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

      if (requireTokenVoting && !enableTokenVoting) {
        setStatus('Error: Token voting must be enabled before it can be required');
        setLoading(false);
        return;
      }

      const parsedTokensPerVoter = Number(tokensPerVoter);
      if (enableTokenVoting && (!Number.isFinite(parsedTokensPerVoter) || parsedTokensPerVoter < 1)) {
        setStatus('Error: Tokens per voter must be at least 1 when token voting is enabled');
        setLoading(false);
        return;
      }

      setStatus('Testing transaction...');
      
      // STEP 4: Try staticCall
      try {
        const result = await contract.createPoll.staticCall(
          pollTitle,
          adminAddr,
          startTs,
          duration,
          enableTokenVoting,
          requireTokenVoting,
          (customTokenManager && ethers.isAddress(customTokenManager)) ? customTokenManager : ethers.ZeroAddress,
          (customVotingPaymaster && ethers.isAddress(customVotingPaymaster)) ? customVotingPaymaster : ethers.ZeroAddress
        );
        console.log('✓ Static call succeeded, will return:', result?.toString());
      } catch (staticErr) {
        const details = getContractErrorDetails(staticErr, contract);
        const msg = details.rawMessage || String(staticErr);
        console.error('Static call failed:', staticErr);
        
        if (msg.includes('Ownable') || msg.includes('caller is not the owner')) {
          setStatus(`Error: Only owner can create polls. Owner: ${ownerCheck}, You: ${addr}`);
        } else if (msg.includes('already exists') || details.normalizedCode === 'POLL_ALREADY_EXISTS') {
          setStatus('Error: Poll title already exists');
        } else if (msg.includes('missing revert data') || msg.includes('CALL_EXCEPTION')) {
          setStatus('Error: Transaction would fail (check console)');
          console.error('This usually means:');
          console.error('- Wrong signer (not owner)');
          console.error('- Contract has a require() that fails');
          console.error('- Insufficient gas (unlikely on local)');
        } else {
          setStatus(`Error: ${details.description}`);
        }
        setLoading(false);
        return;
      }

      // STEP 5: Send real transaction
      setStatus('Submitting transaction...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.createPoll(
          pollTitle,
          adminAddr,
          startTs,
          duration,
          enableTokenVoting,
          requireTokenVoting,
          (customTokenManager && ethers.isAddress(customTokenManager)) ? customTokenManager : ethers.ZeroAddress,
          (customVotingPaymaster && ethers.isAddress(customVotingPaymaster)) ? customVotingPaymaster : ethers.ZeroAddress,
          overrides
        ),
        onRetry: () => setStatus('Nonce conflict detected, retrying with latest nonce...')
      });
      
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

        // Configure token voting if enabled
        if (enableTokenVoting) {
          setStatus('Configuring token voting...');
          const configureTx = await sendTxWithNonceRetry({
            signer,
            sendTx: (overrides = {}) => contract.configureTokenVoting(
              pollId,
              true,
              requireTokenVoting,
              parsedTokensPerVoter,
              allowGaslessVoting,
              overrides
            ),
            onRetry: () => setStatus('Nonce conflict detected, retrying token config...')
          });
          await configureTx.wait();
        }

        // Enable secret ballot and set reveal duration if provided
        const revealMins = Number(pollRevealDuration);
        if (revealMins > 0) {
          try {
            setStatus('Enabling secret ballot...');
            const sbTx = await sendTxWithNonceRetry({
              signer,
              sendTx: (overrides = {}) => contract.enableSecretBallot(pollId, overrides),
              onRetry: () => setStatus('Retrying enableSecretBallot...')
            });
            await sbTx.wait();

            // Set reveal duration using the new ElectionsManager function
            const revealSecs = revealMins * 60;
            setStatus(`Setting reveal duration to ${revealMins} minutes...`);

            const rdTx = await sendTxWithNonceRetry({
              signer,
              sendTx: (overrides = {}) => contract.setRevealDuration(pollId, revealSecs, overrides),
              onRetry: () => setStatus('Retrying setRevealDuration...')
            });
            await rdTx.wait();
          } catch (sbErr) {
            console.error('Secret ballot setup error:', sbErr);
            const details = getContractErrorDetails(sbErr);
            console.error('Full error details:', details);
            setStatus(`⚠️  Secret ballot enabled, but failed to set reveal duration: ${details.description}. Using default 60 minutes.`);
            // Don't throw - poll was created successfully, and continue to show success
          }
        }

        setStatus(
          revealMins > 0
            ? `✅ Poll created with secret ballot (${revealMins} min reveal window)! ID: ${pollId}`
            : enableTokenVoting
            ? `✅ Poll created and token voting configured! ID: ${pollId}`
            : `✅ Poll created! ID: ${pollId}`
        );
      } else {
        setStatus('✅ Poll created successfully!');
      }

      setPollTitle('');
      setPollAdmin('');
      setPollStartTime('');
      setPollDuration('3600');
      setPollRevealDuration('60');
      setEnableTokenVoting(false);
      setRequireTokenVoting(false);
      setTokensPerVoter('1');
      setAllowGaslessVoting(false);
      await loadPolls();
      
    } catch (err) {
      console.error('Create poll error:', err);
      const details = getContractErrorDetails(err);
      const message = details.rawMessage || String(err);
      
      if (message.includes('missing revert data') || message.includes('CALL_EXCEPTION')) {
        setStatus('❌ Transaction failed - See console for fix instructions');
      } else {
        setStatus(`Error: ${details.description}`);
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
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.addOptionToPoll(selectedPollId, candidateName, overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying add candidate...')
      });
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

      const selectedPoll = polls.find(p => String(p.id) === String(voterPollId));
      const tokenConfig = selectedPoll?.tokenConfig;
      const shouldAllocateTokens = Boolean(tokenConfig?.enabled);

      const parsedVoterTokens = Number(voterTokensPerVoter);
      const tokensForThisBatch = tokenConfig?.tokensPerVoter > 0
        ? tokenConfig.tokensPerVoter
        : parsedVoterTokens;

      if (addresses.length === 0) {
        setStatus('No valid addresses provided');
        setLoading(false);
        return;
      }

      if (shouldAllocateTokens && (!Number.isFinite(tokensForThisBatch) || tokensForThisBatch < 1)) {
        setStatus('Error: Tokens per voter must be at least 1 for token-enabled polls');
        setLoading(false);
        return;
      }

      setStatus(`Adding ${addresses.length} voter(s)...`);

      if (shouldAllocateTokens) {
        const tx = await sendTxWithNonceRetry({
          signer,
          sendTx: (overrides = {}) => contract.addVotersWithTokens(voterPollId, addresses, tokensForThisBatch, overrides),
          onRetry: () => setStatus('Nonce conflict detected, retrying add voters with tokens...')
        });
        await tx.wait();
      } else {
        if (addresses.length === 1) {
          const tx = await sendTxWithNonceRetry({
            signer,
            sendTx: (overrides = {}) => contract.addVoter(voterPollId, addresses[0], overrides),
            onRetry: () => setStatus('Nonce conflict detected, retrying add voter...')
          });
          await tx.wait();
        } else {
          const tx = await sendTxWithNonceRetry({
            signer,
            sendTx: (overrides = {}) => contract.addVoters(voterPollId, addresses, overrides),
            onRetry: () => setStatus('Nonce conflict detected, retrying add voters...')
          });
          await tx.wait();
        }
      }

      setStatus(
        shouldAllocateTokens
          ? `${addresses.length} voter(s) added with ${tokensForThisBatch} token(s) each!`
          : `${addresses.length} voter(s) added successfully!`
      );
      setVoterAddresses('');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function topUpVotingTokens(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!topUpPollId || !topUpVoterAddresses) {
        setStatus('Please select a poll and enter voter addresses for token top-up');
        setLoading(false);
        return;
      }

      const amount = Number(topUpAmountPerVoter);
      if (!Number.isFinite(amount) || amount < 1) {
        setStatus('Error: Top-up amount per voter must be at least 1');
        setLoading(false);
        return;
      }

      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      const addresses = topUpVoterAddresses
        .split(',')
        .map(address => address.trim())
        .filter(address => address.length > 0);

      if (addresses.length === 0) {
        setStatus('No valid addresses provided for top-up');
        setLoading(false);
        return;
      }

      setStatus(`Allocating ${amount} token(s) each to ${addresses.length} voter(s)...`);

      // Owner uses allocateVotingTokens (works anytime);
      // Non-owner (franchisee/admin) uses addVotersWithTokens (works before poll starts, re-adds are skipped)
      let tx;
      if (isOwner) {
        const amounts = addresses.map(() => amount);
        tx = await sendTxWithNonceRetry({
          signer,
          sendTx: (overrides = {}) => contract.allocateVotingTokens(topUpPollId, addresses, amounts, overrides),
          onRetry: () => setStatus('Nonce conflict detected, retrying token top-up...')
        });
      } else {
        // addVotersWithTokens: onlyAdminOrOwner, silently skips already-authorized voters, allocates tokens
        tx = await sendTxWithNonceRetry({
          signer,
          sendTx: (overrides = {}) => contract.addVotersWithTokens(topUpPollId, addresses, amount, overrides),
          onRetry: () => setStatus('Nonce conflict detected, retrying token top-up...')
        });
      }
      await tx.wait();

      setStatus(`✅ Top-up successful: ${amount} token(s) allocated to ${addresses.length} voter(s).`);
      setTopUpVoterAddresses('');
      await loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err);
      setStatus(`Error: ${details.description}`);
    } finally {
      setLoading(false);
    }
  }

  async function checkVoterTokenBalance(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!balanceCheckPollId || !balanceCheckVoterAddress) {
        setStatus('Please select a poll and enter a voter address to check balance');
        setLoading(false);
        return;
      }

      if (!ethers.isAddress(balanceCheckVoterAddress)) {
        setStatus('Error: Invalid voter address for balance check');
        setLoading(false);
        return;
      }

      const provider = getEffectiveProvider();
      const contract = getContract(provider);
      const balance = await contract.getVoterTokenBalance(balanceCheckPollId, balanceCheckVoterAddress);

      setBalanceCheckResult({
        pollId: balanceCheckPollId,
        voter: balanceCheckVoterAddress,
        balance: Number(balance)
      });
      setStatus(`Token balance loaded for ${balanceCheckVoterAddress}`);
    } catch (err) {
      const details = getContractErrorDetails(err);
      setStatus(`Error: ${details.description}`);
      setBalanceCheckResult(null);
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
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.transferOwnership(newOwnerAddress, overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying ownership transfer...')
      });
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
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.cancelOwnershipTransfer(overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying cancel transfer...')
      });
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
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.acceptOwnership(overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying accept ownership...')
      });
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

  async function setVotingPaymaster(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!paymasterAddress || !ethers.isAddress(paymasterAddress)) {
        setStatus('Error: Invalid paymaster address');
        setLoading(false);
        return;
      }

      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);

      setStatus('Setting voting paymaster...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.setVotingPaymaster(paymasterAddress, overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying set paymaster...')
      });
      await tx.wait();

      setStatus('Voting paymaster set successfully. Gasless token voting can now be sponsored by this paymaster.');
      await loadOwnership(addr);
      await loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err);
      setStatus(`Error: ${details.description}`);
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
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.revealResults(pollId, overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying reveal...')
      });
      await tx.wait();

      setStatus('Results revealed successfully!');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  // Poll ending is handled automatically by the contract when endTime is reached.
  // No manual endPoll button is exposed.

  // ─── Enable Secret Ballot for a poll ───────────────────────────────────────
  async function enableSecretBallotForPoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!secretBallotPollId) { setStatus('Select a poll first'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Enabling secret ballot...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.enableSecretBallot(secretBallotPollId, overrides),
        onRetry: () => setStatus('Retrying enableSecretBallot...')
      });
      await tx.wait();
      setStatus(`✅ Secret ballot enabled for poll #${secretBallotPollId}`);

      // Set custom reveal duration
      const revealSecs = Number(revealDurationMinutes) * 60;
      if (revealSecs > 0) {
        try {
          setStatus(`Setting reveal duration to ${revealDurationMinutes} minutes...`);
          const rdTx = await sendTxWithNonceRetry({
            signer,
            sendTx: (overrides = {}) => contract.setRevealDuration(secretBallotPollId, revealSecs, overrides),
            onRetry: () => setStatus('Retrying setRevealDuration...')
          });
          await rdTx.wait();
          setStatus(`✅ Secret ballot enabled with ${revealDurationMinutes}m reveal window for poll #${secretBallotPollId}`);
        } catch (rdErr) {
          setStatus(`✅ Secret ballot enabled, but failed to set reveal duration: ${getContractErrorDetails(rdErr).description}`);
        }
      }
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Enable Quadratic Voting for a poll ────────────────────────────────────
  async function enableQuadraticForPoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!quadraticPollId) { setStatus('Select a poll first'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Enabling quadratic voting...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.enableQuadraticVoting(quadraticPollId, overrides),
        onRetry: () => setStatus('Retrying enableQuadraticVoting...')
      });
      await tx.wait();
      setStatus(`✅ Quadratic voting enabled for poll #${quadraticPollId}`);
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Enable Delegation for a poll ──────────────────────────────────────────
  async function enableDelegationForPoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!delegationPollId) { setStatus('Select a poll first'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Enabling vote delegation...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.enableDelegation(delegationPollId, overrides),
        onRetry: () => setStatus('Retrying enableDelegation...')
      });
      await tx.wait();
      setStatus(`✅ Vote delegation enabled for poll #${delegationPollId}`);
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Set Max Choices (multi-choice voting) ─────────────────────────────────
  async function setMaxChoicesForPoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!multiChoicePollId || !maxChoices) { setStatus('Select a poll and enter max choices'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Setting max choices...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.setMaxChoices(multiChoicePollId, Number(maxChoices), overrides),
        onRetry: () => setStatus('Retrying setMaxChoices...')
      });
      await tx.wait();
      setStatus(`✅ Max choices set to ${maxChoices} for poll #${multiChoicePollId}`);
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Set Poll Metadata ─────────────────────────────────────────────────────
  async function setPollMetadataURI(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!metadataPollId || !metadataURI) { setStatus('Select a poll and enter metadata URI'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Setting poll metadata...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.setPollMetadata(metadataPollId, metadataURI, overrides),
        onRetry: () => setStatus('Retrying setPollMetadata...')
      });
      await tx.wait();
      setStatus(`✅ Metadata set for poll #${metadataPollId}`);
      setMetadataURI('');
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Remove Voter ──────────────────────────────────────────────────────────
  async function removeVoterFromPoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!removeVoterPollId || !removeVoterAddress) { setStatus('Select a poll and enter voter address'); setLoading(false); return; }
      if (!ethers.isAddress(removeVoterAddress)) { setStatus('Error: Invalid voter address'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Removing voter...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.removeVoter(removeVoterPollId, removeVoterAddress, overrides),
        onRetry: () => setStatus('Retrying removeVoter...')
      });
      await tx.wait();
      setStatus(`✅ Voter ${removeVoterAddress} removed from poll #${removeVoterPollId}`);
      setRemoveVoterAddress('');
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Set SecretBallotManager address ───────────────────────────────────────
  async function setSecretBallotManagerAddress(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!sbmAddress || !ethers.isAddress(sbmAddress)) { setStatus('Error: Invalid SecretBallotManager address'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Setting SecretBallotManager...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.setSecretBallotManager(sbmAddress, overrides),
        onRetry: () => setStatus('Retrying setSecretBallotManager...')
      });
      await tx.wait();
      setStatus(`✅ SecretBallotManager set to ${sbmAddress}`);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Set TokenManager address ──────────────────────────────────────────────
  async function setTokenManagerAddress(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!tokenMgrAddress || !ethers.isAddress(tokenMgrAddress)) { setStatus('Error: Invalid TokenManager address'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Setting TokenManager...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.setTokenManager(tokenMgrAddress, overrides),
        onRetry: () => setStatus('Retrying setTokenManager...')
      });
      await tx.wait();
      setStatus(`✅ TokenManager set to ${tokenMgrAddress}`);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Lock Infrastructure ───────────────────────────────────────────────────
  async function lockInfra() {
    setStatus(null);
    setLoading(true);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Locking infrastructure (irreversible)...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.lockInfrastructure(overrides),
        onRetry: () => setStatus('Retrying lockInfrastructure...')
      });
      await tx.wait();
      setInfraLocked(true);
      setStatus('✅ Infrastructure locked permanently.');
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  // ─── Franchise Management ──────────────────────────────────────────────────
  async function loadFranchises() {
    try {
      const provider = getEffectiveProvider();
      const fm = getFranchiseManagerContract(provider);
      setFranchiseManagerAddr(fm.target);
      const count = Number(await fm.franchiseCount());
      const fee = await fm.transferFee();
      setTransferFee(ethers.formatEther(fee));
      // Fetch accumulated fees (contract ETH balance)
      try {
        const balance = await provider.getBalance(fm.target);
        setFmBalance(ethers.formatEther(balance));
      } catch { setFmBalance('0'); }
      const data = [];
      for (let i = 1; i <= count; i++) {
        try {
          const f = await fm.getFranchise(i);
          const tr = await fm.transferRequests(i);
          data.push({
            id: i,
            franchisee: f.franchisee || f[0],
            expiresAt: Number(f.expiresAt || f[1]),
            maxPolls: Number(f.maxPolls || f[2]),
            pollsUsed: Number(f.pollsUsed || f[3]),
            feePerPoll: ethers.formatEther(f.feePerPoll || f[4]),
            expired: f.expired ?? f[5],
            exhausted: f.exhausted ?? f[6],
            transferRequest: {
              newFranchisee: tr.newFranchisee || tr[0],
              feePaid: ethers.formatEther(tr.feePaid || tr[1]),
              pending: tr.pending ?? tr[2]
            }
          });
        } catch { }
      }
      setFranchises(data);

      // Check if connected user is a franchisee
      if (addr) {
        try {
          const fId = Number(await fm.franchiseeToId(addr));
          if (fId > 0) {
            setIsFranchisee(true);
            setMyFranchiseId(fId);
            const mine = data.find(f => f.id === fId);
            setMyFranchise(mine || null);
          } else {
            setIsFranchisee(false);
            setMyFranchiseId(0);
            setMyFranchise(null);
          }
        } catch {
          setIsFranchisee(false);
          setMyFranchiseId(0);
          setMyFranchise(null);
        }
      }
    } catch (err) {
      console.error('Error loading franchises:', err.message);
    }
  }

  // ─── Franchisee Actions ────────────────────────────────────────────────────
  async function handleCreateFranchisePoll(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!fpTitle.trim()) { setStatus('Error: Poll title is required'); setLoading(false); return; }
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      const nowTs = Math.floor(Date.now() / 1000);
      // Use user-selected start time or default buffer
      // Local mode: 15s for quick testing; Production: 10 minutes
      const defaultBuffer = mode === 'local' ? 15 : 600;
      const startTime = fpStartTime ? parseDateTimeLocalToUnix(fpStartTime) : nowTs + defaultBuffer;
      if (!startTime || startTime <= nowTs) {
        setStatus(`Error: Start time must be in the future. Leave blank for ${mode === 'local' ? '15 seconds' : '10 minutes'} from now.`);
        setLoading(false);
        return;
      }
      setStatus('Creating franchise poll...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => {
          const feePerPoll = myFranchise ? ethers.parseEther(myFranchise.feePerPoll) : 0n;
          return fm.createFranchisePoll(
            fpTitle.trim(),
            startTime,
            Number(fpDuration),
            fpEnableToken,
            fpRequireToken,
            { ...overrides, value: feePerPoll }
          );
        },
        onRetry: () => setStatus('Retrying createFranchisePoll...')
      });
      const receipt = await tx.wait();
      setStatus(`✅ Franchise poll created! TX: ${receipt.hash.slice(0, 10)}...`);
      setFpTitle('');
      setFpStartTime('');
      await loadFranchises();
      await loadPolls();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleRequestTransfer(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!transferToAddress || !ethers.isAddress(transferToAddress)) {
        setStatus('Error: Invalid new franchisee address'); setLoading(false); return;
      }
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      const fee = await fm.transferFee();
      setStatus('Requesting franchise transfer...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.requestTransfer(myFranchiseId, transferToAddress, { ...overrides, value: fee }),
        onRetry: () => setStatus('Retrying requestTransfer...')
      });
      await tx.wait();
      setStatus('✅ Transfer request submitted! Awaiting owner approval.');
      setTransferToAddress('');
      await loadFranchises();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleGrantFranchise(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!grantFranchisee || !ethers.isAddress(grantFranchisee)) {
        setStatus('Error: Invalid franchisee address'); setLoading(false); return;
      }
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      setStatus('Granting franchise...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.grantFranchise(
          grantFranchisee,
          Number(grantDuration),
          Number(grantMaxPolls),
          ethers.parseEther(grantFeePerPoll || '0'),
          ethers.ZeroAddress, // tokenManager (use default)
          (grantPaymaster && ethers.isAddress(grantPaymaster)) ? grantPaymaster : ethers.ZeroAddress,
          overrides
        ),
        onRetry: () => setStatus('Retrying grantFranchise...')
      });
      await tx.wait();
      setStatus('✅ Franchise granted!');
      setGrantFranchisee('');
      await loadFranchises();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleSetTransferFee(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      setStatus('Setting transfer fee...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.setTransferFee(ethers.parseEther(newTransferFee || '0'), overrides),
        onRetry: () => setStatus('Retrying setTransferFee...')
      });
      await tx.wait();
      setTransferFee(newTransferFee);
      setNewTransferFee('');
      setStatus('✅ Transfer fee updated!');
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleApproveTransfer(franchiseId) {
    setStatus(null);
    setLoading(true);
    try {
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      setStatus(`Approving transfer for franchise #${franchiseId}...`);
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.approveTransfer(franchiseId, overrides),
        onRetry: () => setStatus('Retrying approveTransfer...')
      });
      await tx.wait();
      setStatus(`✅ Transfer approved for franchise #${franchiseId}`);
      await loadFranchises();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleRejectTransfer(franchiseId) {
    setStatus(null);
    setLoading(true);
    try {
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      setStatus(`Rejecting transfer for franchise #${franchiseId}...`);
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.rejectTransfer(franchiseId, overrides),
        onRetry: () => setStatus('Retrying rejectTransfer...')
      });
      await tx.wait();
      setStatus(`✅ Transfer rejected for franchise #${franchiseId}`);
      await loadFranchises();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleWithdrawFees() {
    setStatus(null);
    setLoading(true);
    try {
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      setStatus('Withdrawing fees...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.withdrawFees(overrides),
        onRetry: () => setStatus('Retrying withdrawFees...')
      });
      await tx.wait();
      setStatus('✅ Fees withdrawn!');
      await loadFranchises(); // refresh balance
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleAddPolls(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!addPollsFranchiseId || !addPollsCount || Number(addPollsCount) < 1) {
        setStatus('Error: Select a franchise and enter a valid number of polls');
        setLoading(false);
        return;
      }
      const signer = walletSigner || await getSigner();
      const fm = getFranchiseManagerContract(signer);
      setStatus(`Adding ${addPollsCount} polls to franchise #${addPollsFranchiseId}...`);
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => fm.addPolls(Number(addPollsFranchiseId), Number(addPollsCount), overrides),
        onRetry: () => setStatus('Retrying addPolls...')
      });
      await tx.wait();
      setStatus(`✅ Added ${addPollsCount} polls to franchise #${addPollsFranchiseId}`);
      setAddPollsCount('');
      await loadFranchises();
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function handleSetFranchiseManager(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      if (!fmAddrInput || !ethers.isAddress(fmAddrInput)) {
        setStatus('Error: Invalid FranchiseManager address');
        setLoading(false);
        return;
      }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Setting FranchiseManager...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.setFranchiseManager(fmAddrInput, overrides),
        onRetry: () => setStatus('Retrying setFranchiseManager...')
      });
      await tx.wait();
      setStatus(`✅ FranchiseManager set to ${fmAddrInput}`);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    } finally { setLoading(false); }
  }

  async function togglePollDetails(pollId) {
    if (expandedPoll === pollId) {
      setExpandedPoll(null);
    } else {
      const currentPoll = polls.find(p => p.id === pollId);
      // Always reload options for revealed polls to get fresh vote counts
      if (!currentPoll?.options || currentPoll?.revealed) {
        const details = await loadPollDetails(pollId);
        if (details) {
          setPolls(polls.map(p => p.id === pollId ? { ...p, options: details.options } : p));
        }
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
      loadFranchises();
      loadExistingPollNames();
      let pollInterval;
      const refreshMs = Number(process.env.REACT_APP_REFRESH_INTERVAL);

      const startPolling = () => {
        if (document.visibilityState !== 'visible') return;
        loadPolls();
        if (refreshMs > 0) {
          pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
              loadPolls();
            }
          }, refreshMs);
        }
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

      // Real-time event listeners — refresh immediately when key events fire
      const readContract = getContract(getProvider());
      const eventHandler = () => { loadPolls(); loadExistingPollNames(); };
      const eventNames = ['PollCreated', 'Voted', 'ResultsRevealed', 'OptionAdded', 'VoterAuthorized', 'VoterUnauthorized', 'SecretBallotEnabled', 'PollMetadataSet'];
      const listeners = [];
      for (const eventName of eventNames) {
        try {
          readContract.on(eventName, eventHandler);
          listeners.push(eventName);
        } catch { /* event may not exist in ABI */ }
      }
      console.log('📡 Admin: Listening for live events:', listeners.join(', '));

      return () => {
        stopPolling();
        document.removeEventListener('visibilitychange', handleVisibility);
        for (const eventName of listeners) {
          try { readContract.off(eventName, eventHandler); } catch {}
        }
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

  const [activeTab, setActiveTab] = useState('dashboard');

  // No auto-redirect needed — franchisees now have full access to Dashboard, Create, Participants, Settings tabs

  const previewStartTs = pollStartTime ? parseDateTimeLocalToUnix(pollStartTime) : null;
  const previewStartUtc = previewStartTs ? formatUtcDateTime(previewStartTs) : null;
  const previewStartOffset = previewStartTs ? formatLocalUtcOffset(previewStartTs) : null;

  const voterPath = mode === 'local' ? '/local/voter' : '/voter';

  const isFranchiseeRole = role === 'franchisee';

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', showWhen: () => isOwner || isFranchisee },
    { id: 'create', label: 'Create Poll', icon: '➕', showWhen: () => isOwner || isFranchisee },
    { id: 'participants', label: 'Candidates & Voters', icon: '👥', showWhen: () => isOwner || isFranchisee, needsPolls: true },
    { id: 'settings', label: 'Poll Settings', icon: '⚙️', showWhen: () => isOwner || isFranchisee, needsPolls: true },
    { id: 'franchises', label: 'Franchises', icon: '🏢', showWhen: () => (isOwner || isFranchisee) && !isFranchiseeRole },
    { id: 'infra', label: 'Infrastructure', icon: '🔧', ownerOnly: true },
  ];

  const visibleTabs = TABS.filter(tab => {
    if (tab.showWhen && !tab.showWhen()) return false;
    if (tab.ownerOnly && !isOwner) return false;
    if (tab.needsPolls && polls.length === 0) return false;
    return true;
  });

  // ─── Filtered + paginated dashboard polls ──────────────────────────────────
  // First filter to "my polls" (franchisee-scoped or all for owner)
  const myPolls = useMemo(() => {
    if (addr && isFranchiseeRole) {
      return polls.filter(p => p.admin?.toLowerCase() === addr.toLowerCase());
    }
    return polls;
  }, [polls, addr, isFranchiseeRole]);

  const filteredPolls = useMemo(() => {
    const nowTs = Math.floor(Date.now() / 1000);
    let result = [...myPolls];
    // Text search
    if (dashboardSearch.trim()) {
      const q = dashboardSearch.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        (p.admin && p.admin.toLowerCase().includes(q))
      );
    }
    // Status filter
    if (dashboardFilter !== 'all') {
      result = result.filter(p => {
        const st = p.status || {};
        const hasEnded = st.ended || (p.endTime && p.endTime <= nowTs);
        const hasStarted = p.startTime ? p.startTime <= nowTs : true;
        switch (dashboardFilter) {
          case 'active': return hasStarted && !hasEnded;
          case 'ended': return hasEnded && !st.revealed;
          case 'revealed': return !!st.revealed;
          case 'scheduled': return !hasStarted;
          default: return true;
        }
      });
    }
    return result;
  }, [myPolls, dashboardSearch, dashboardFilter]);

  const dashboardPollsPage = useMemo(() => {
    const start = (dashboardPage - 1) * dashboardPageSize;
    return filteredPolls.slice(start, start + dashboardPageSize);
  }, [filteredPolls, dashboardPage, dashboardPageSize]);

  // Reset page when filter/search changes
  useEffect(() => { setDashboardPage(1); }, [dashboardSearch, dashboardFilter]);

  // ─── Filtered + paginated franchises ───────────────────────────────────────
  const filteredFranchises = useMemo(() => {
    if (!franchiseSearch.trim()) return franchises;
    const q = franchiseSearch.toLowerCase();
    return franchises.filter(f =>
      String(f.id).includes(q) ||
      f.franchisee.toLowerCase().includes(q)
    );
  }, [franchises, franchiseSearch]);

  const franchisesPage = useMemo(() => {
    const start = (franchisePage - 1) * franchisePageSize;
    return filteredFranchises.slice(start, start + franchisePageSize);
  }, [filteredFranchises, franchisePage, franchisePageSize]);

  useEffect(() => { setFranchisePage(1); }, [franchiseSearch]);

  // ─── Helper: render poll selector dropdown ─────────────────────────────────
  function PollSelect({ value, onChange, filterFn, placeholder = 'Select Poll', className = 'form-input' }) {
    // Always scope to polls where the connected user is the admin
    const myPolls = polls.filter(p => p.admin?.toLowerCase() === addr?.toLowerCase());
    const filtered = filterFn ? myPolls.filter(filterFn) : myPolls;
    return (
      <select value={value} onChange={onChange} className={className}>
        <option value="">{placeholder}</option>
        {filtered.map(poll => (
          <option key={poll.id} value={poll.id}>
            Poll #{poll.id}: {poll.title}
          </option>
        ))}
      </select>
    );
  }

  // ─── Helper: compute poll status label & flags ──────────────────────────────
  function getPollStatusInfo(poll) {
    const nowTs = Math.floor(Date.now() / 1000);
    const st = poll.status || { started: true, active: false, ended: poll.ended, revealed: poll.revealed };
    const hasStartedByTime = poll.startTime ? nowTs >= poll.startTime : true;
    const hasEndedByTime = poll.endTime ? nowTs >= poll.endTime : false;
    const isEndedEffective = Boolean(st.ended || hasEndedByTime);
    const isUpcoming = !isEndedEffective && !hasStartedByTime;
    const isActiveEffective = !isEndedEffective && (st.active || (hasStartedByTime && !hasEndedByTime));
    const statusLabel = st.revealed ? 'Revealed' : isEndedEffective ? 'Ended' : isActiveEffective ? 'Active' : isUpcoming ? 'Scheduled' : 'Inactive';
    const timeLabel = isEndedEffective ? 'Ended' : isUpcoming ? formatTimeUntil(poll.startTime) : formatTimeRemaining(poll.endTime);
    const chipClass = st.revealed ? 'chip-success' : isEndedEffective ? 'chip-warning' : isActiveEffective ? '' : 'chip-warning';
    return { st, isEndedEffective, isUpcoming, isActiveEffective, statusLabel, timeLabel, chipClass };
  }

  return (
    <div className="admin-panel">
      {/* ─── Global Status Banner ─────────────────────────────────────── */}
      {status && (
        <div className={`status-banner ${status.includes('Error') || status.includes('❌') ? 'status-error' : 'status-success'}`}>
          {status}
        </div>
      )}

      {/* ─── Connection Bar (always visible) ──────────────────────────── */}
      <section className="panel-card admin-connection-bar">
        <div className="admin-connection-bar__inner">
          <div className="admin-connection-bar__left">
            <h3 style={{ margin: 0 }}>Connection</h3>
            {addr && (
              <span className="address-pill">
                {addr} {isOwner && '(Owner)'}
              </span>
            )}
          </div>
          <div className="admin-connection-bar__right">
            {mode === 'local' ? (
              <div className="account-grid">
                {(isFranchiseeRole ? HARDHAT_ACCOUNTS : HARDHAT_ACCOUNTS.slice(0, 1)).map((account, index) => (
                  <button
                    key={index}
                    className={`btn secondary btn-sm ${selectedAccount === index && walletSigner ? 'is-active' : ''}`}
                    onClick={() => connectLocalAccount(index)}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn" onClick={connectWallet}>
                {addr ? 'Reconnect MetaMask' : 'Connect MetaMask Wallet'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── Not-owner message (only on admin page, not franchisee page) ── */}
      {addr && !isOwner && !isFranchisee && !isFranchiseeRole && (
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

      {/* ─── Not-franchisee message (only on franchisee page) ─────────── */}
      {addr && !isFranchisee && isFranchiseeRole && (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>Franchisee Access</h3>
            <span className="chip">Franchisee only</span>
          </div>
          <div className="status-banner status-warning">
            You don't have an active franchise. Contact the contract owner to be granted one.
          </div>
        </section>
      )}

      {/* ─── Franchise Info Banner (franchisee page only) ─────────────── */}
      {addr && isFranchisee && isFranchiseeRole && myFranchise && (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>My Franchise #{myFranchiseId}</h3>
            <span className={`chip ${!myFranchise.expired && !myFranchise.exhausted ? 'chip-success' : 'chip-warning'}`}>
              {myFranchise.expired ? 'Expired' : myFranchise.exhausted ? 'Exhausted' : 'Active'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: 14 }}>
            <div><span className="muted">Polls Used:</span> <strong>{myFranchise.pollsUsed} / {myFranchise.maxPolls}</strong></div>
            <div><span className="muted">Remaining:</span> <strong>{myFranchise.maxPolls - myFranchise.pollsUsed}</strong></div>
            <div><span className="muted">Expires:</span> <strong>{new Date(myFranchise.expiresAt * 1000).toLocaleString()}</strong></div>
            <div><span className="muted">Fee/Poll:</span> <strong>{myFranchise.feePerPoll === '0.0' ? 'Free' : `${myFranchise.feePerPoll} ETH`}</strong></div>
          </div>
        </section>
      )}

      {/* ─── Tab Navigation ───────────────────────────────────────────── */}
      {addr && (isOwner || (isFranchisee && isFranchiseeRole)) && (
        <nav className="admin-tabs">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              className={`admin-tab ${activeTab === tab.id ? 'admin-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="admin-tab__icon">{tab.icon}</span>
              <span className="admin-tab__label">{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Dashboard                                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {addr && (isOwner || isFranchisee) && activeTab === 'dashboard' && (
        <div className="admin-tab-content">
          {polls.length > 0 ? (
            <section className="panel-card panel-card--wide">
              <div className="panel-head">
                <h3>{isOwner ? 'Manage Polls' : 'My Polls'} ({filteredPolls.length} of {myPolls.length})</h3>
                {(isOwner || isFranchisee) && <button className="btn btn-sm" onClick={() => setActiveTab('create')}>+ New Poll</button>}
              </div>

              <SearchBar
                searchTerm={dashboardSearch}
                onSearchChange={setDashboardSearch}
                placeholder="Search polls by title, admin or ID…"
                filters={[
                  { id: 'all',       label: 'All',       active: dashboardFilter === 'all' },
                  { id: 'active',    label: 'Active',    active: dashboardFilter === 'active' },
                  { id: 'ended',     label: 'Ended',     active: dashboardFilter === 'ended' },
                  { id: 'revealed',  label: 'Revealed',  active: dashboardFilter === 'revealed' },
                  { id: 'scheduled', label: 'Scheduled', active: dashboardFilter === 'scheduled' },
                ]}
                onFilterToggle={(id) => setDashboardFilter(id)}
              />

              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title</th>
                      <th>Admin</th>
                      <th>Status</th>
                      <th>Time</th>
                      <th>Candidates</th>
                      <th>Votes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardPollsPage.map(poll => {
                      const info = getPollStatusInfo(poll);
                      return (
                        <React.Fragment key={poll.id}>
                          <tr>
                            <td>{poll.id}</td>
                            <td>{poll.title}</td>
                            <td className="muted small" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poll.admin}</td>
                            <td><span className={`chip ${info.chipClass}`}>{info.statusLabel}</span></td>
                            <td>{info.timeLabel}</td>
                            <td>{poll.optionsCount}</td>
                            <td>{poll.totalVotes}</td>
                            <td style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              <button className="btn btn-sm secondary" onClick={() => togglePollDetails(poll.id)}>
                                {expandedPoll === poll.id ? 'Hide' : 'Details'}
                              </button>
                              {(() => {
                                if (info.st.revealed) return null;
                                const nowSec = Math.floor(Date.now() / 1000);
                                const TIME_BUFFER = 30;
                                const revealDuration = poll.isSecretBallot ? (poll.revealDuration || 3600) : 0;
                                // Standard poll: can reveal after endTime + TIME_BUFFER
                                // Secret ballot: can reveal after endTime + TIME_BUFFER + revealDuration
                                const revealableAfter = poll.isSecretBallot
                                  ? (poll.endTime + TIME_BUFFER + revealDuration)
                                  : (poll.endTime + TIME_BUFFER);
                                const canReveal = info.isEndedEffective && nowSec >= revealableAfter;
                                const waitingForRevealPeriod = info.isEndedEffective && !canReveal;
                                const revealCountdown = waitingForRevealPeriod ? Math.max(0, revealableAfter - nowSec) : 0;
                                const revealMins = Math.floor(revealCountdown / 60);
                                const revealSecs = revealCountdown % 60;
                                return (
                                  <>
                                    {canReveal && (
                                      <button className="btn btn-sm" onClick={() => revealResults(poll.id)} disabled={loading}>Reveal</button>
                                    )}
                                    {waitingForRevealPeriod && (
                                      <>
                                        {/* For secret ballots: hide Reveal button during voter reveal period — voters must reveal first */}
                                        {!poll.isSecretBallot && (
                                          <button className="btn btn-sm" onClick={() => revealResults(poll.id)} disabled={loading}>
                                            Reveal
                                          </button>
                                        )}
                                        <span className="muted small" style={{ alignSelf: 'center' }}>
                                          {poll.isSecretBallot
                                            ? `⏳ Voters revealing (${revealMins}m ${revealSecs}s left) — ${poll.sbStatus?.reveals ?? '?'}/${poll.sbStatus?.commits ?? '?'} revealed`
                                            : `Finalizing (${revealSecs}s)...`}
                                        </span>
                                      </>
                                    )}
                                  </>
                                );
                              })()}
                            </td>
                          </tr>
                          {expandedPoll === poll.id && poll.options && (
                            <tr>
                              <td colSpan="8" style={{ padding: '0.5rem 1rem', background: 'var(--surface-alt, #f7f8fa)' }}>
                                <strong>Candidates</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                                  {poll.options.map(opt => (
                                    <span key={opt.id} className="chip">
                                      {opt.name} {poll.revealed ? `(${opt.votes} votes)` : ''}
                                    </span>
                                  ))}
                                </div>
                                {!poll.revealed && (poll.isSecretBallot ? poll.commitCount : poll.totalVotes) > 0 && (
                                  <div className="muted small" style={{ marginTop: '0.5rem' }}>
                                    🔒 {poll.isSecretBallot ? poll.commitCount : poll.totalVotes} {poll.isSecretBallot ? 'commit' : 'vote'}{(poll.isSecretBallot ? poll.commitCount : poll.totalVotes) !== 1 ? 's' : ''} cast — per-candidate breakdown hidden until results are revealed.
                                  </div>
                                )}
                                {!poll.revealed && (poll.isSecretBallot ? poll.commitCount : poll.totalVotes) === 0 && (
                                  <div className="muted small" style={{ marginTop: '0.5rem' }}>
                                    No {poll.isSecretBallot ? 'commits' : 'votes'} cast yet.
                                  </div>
                                )}
                                {poll.isSecretBallot && <span className="chip" style={{ marginTop: '0.25rem' }}>Secret Ballot</span>}
                                {poll.quadraticEnabled && <span className="chip" style={{ marginTop: '0.25rem' }}>Quadratic</span>}
                                {poll.maxChoices > 0 && <span className="chip" style={{ marginTop: '0.25rem' }}>Multi-choice (max {poll.maxChoices})</span>}
                                {poll.delegationEnabled && <span className="chip" style={{ marginTop: '0.25rem' }}>Delegation</span>}
                                {poll.metadataURI && <div className="muted small" style={{ marginTop: '0.25rem', wordBreak: 'break-all' }}>Metadata: {poll.metadataURI}</div>}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {dashboardPollsPage.length === 0 && (
                      <tr><td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem' }}>No polls match your search.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                totalItems={filteredPolls.length}
                page={dashboardPage}
                pageSize={dashboardPageSize}
                onPageChange={setDashboardPage}
                onPageSizeChange={(s) => { setDashboardPageSize(s); setDashboardPage(1); }}
              />
            </section>
          ) : (
            <div className="empty-state">
              No polls created yet.{' '}
              <button className="btn" onClick={() => setActiveTab('create')}>Create Your First Poll</button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Create Poll                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {addr && (isOwner || isFranchisee) && activeTab === 'create' && (
        <div className="admin-tab-content">
          <div className="admin-tab-grid">

            {/* ── Owner: Create Poll via ElectionsManager ──────────── */}
            {isOwner && (
            <section className="panel-card">
              <div className="panel-head">
                <h3>Create New Poll</h3>
              </div>
              <form onSubmit={createPoll} className="form-stack">
                <input
                  type="text"
                  placeholder="Poll Title"
                  value={pollTitle}
                  onChange={e => { setPollTitle(e.target.value); setTitleDuplicateWarning(''); }}
                  onBlur={() => pollTitle.trim() && checkTitleDuplicate(pollTitle.trim(), setTitleDuplicateWarning)}
                  className={`form-input ${titleDuplicateWarning ? 'input-warning' : ''}`}
                />
                {titleDuplicateWarning && (
                  <div className="duplicate-warning">{titleDuplicateWarning}</div>
                )}
                {existingPollNames.length > 0 && (
                  <details className="existing-names-list">
                    <summary className="muted small">View existing poll names ({existingPollNames.length})</summary>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                      {existingPollNames.map((n, i) => <span key={i} className="name-chip">{n}</span>)}
                    </div>
                  </details>
                )}
                <input
                  type="text"
                  placeholder="Admin Address (leave empty to use your address)"
                  value={pollAdmin}
                  onChange={e => setPollAdmin(e.target.value)}
                  className="form-input"
                />
                <label className="form-label">Start Time</label>
                <input
                  type="datetime-local"
                  value={pollStartTime}
                  onChange={e => setPollStartTime(e.target.value)}
                  className="form-input"
                />
                <div className="muted small">Leave blank to start 1 minute from now. Selected time is your local time and will be converted to UTC automatically.</div>
                {pollStartTime && (
                  <div className="muted small">
                    You selected local time: {previewStartTs ? new Date(previewStartTs * 1000).toLocaleString() : 'Invalid date'}
                    {previewStartOffset ? ` (${previewStartOffset})` : ''}
                    {previewStartUtc ? ` → submitted as UTC: ${previewStartUtc}` : ''}
                  </div>
                )}
                <label className="form-label">Duration</label>
                <input
                  type="number"
                  placeholder="Duration (seconds)"
                  value={pollDuration}
                  onChange={e => setPollDuration(e.target.value)}
                  className="form-input"
                />
                <div className="muted small">Suggested: 300 (5 min), 3600 (1 hour), 86400 (1 day)</div>

                <label className="form-label">Reveal Duration (minutes) <span className="muted small">— for secret ballot</span></label>
                <input
                  type="number"
                  min="1"
                  placeholder="Reveal duration (minutes)"
                  value={pollRevealDuration}
                  onChange={e => setPollRevealDuration(e.target.value)}
                  className="form-input"
                />
                <div className="muted small">
                  Time window for voters to reveal their secret votes after poll ends. Default: 60 minutes.
                  {Number(pollRevealDuration) > 0 && (
                    <strong> Note: Polls with secret ballot will start 90 seconds from creation to allow configuration time.</strong>
                  )}
                </div>

                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Poll'}
                </button>
              </form>
            </section>
            )}

            {/* ── Owner: Token Voting Options ──────────────────────── */}
            {isOwner && (
            <section className="panel-card">
              <div className="panel-head">
                <h3>Token Voting Options</h3>
              </div>
              <div className="form-stack">
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={enableTokenVoting}
                    onChange={e => {
                      const enabled = e.target.checked;
                      setEnableTokenVoting(enabled);
                      if (!enabled) setRequireTokenVoting(false);
                    }}
                  />
                  <span>Enable token voting for this poll</span>
                </label>
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={requireTokenVoting}
                    disabled={!enableTokenVoting}
                    onChange={e => {
                      const required = e.target.checked;
                      setRequireTokenVoting(required);
                      if (required) setEnableTokenVoting(true);
                    }}
                  />
                  <span>Require token voting (voters must spend tokens)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Tokens per voter"
                  value={tokensPerVoter}
                  onChange={e => setTokensPerVoter(e.target.value)}
                  className="form-input"
                  disabled={!enableTokenVoting}
                />
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={allowGaslessVoting}
                    disabled={!enableTokenVoting}
                    onChange={e => setAllowGaslessVoting(e.target.checked)}
                  />
                  <span>Allow gasless token voting (requires paymaster)</span>
                </label>

                <hr style={{ margin: '12px 0', opacity: 0.1 }} />
                <details>
                  <summary className="muted small" style={{ cursor: 'pointer' }}>Advanced: Per-poll custom managers</summary>
                  <div className="form-stack" style={{ marginTop: 8 }}>
                    <label className="form-label">Custom Token Manager Address</label>
                    <input
                      type="text"
                      placeholder="0x... (leave empty for global default)"
                      value={customTokenManager}
                      onChange={e => setCustomTokenManager(e.target.value)}
                      className="form-input"
                    />
                    <label className="form-label">Custom Voting Paymaster Address</label>
                    <input
                      type="text"
                      placeholder="0x... (leave empty for global default)"
                      value={customVotingPaymaster}
                      onChange={e => setCustomVotingPaymaster(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">Leave empty to use the global TokenManager and VotingPaymaster. Only set these if you have deployed custom per-poll managers.</div>
                  </div>
                </details>
              </div>
            </section>
            )}

            {/* ── Franchisee: Create Poll via FranchiseManager ─────── */}
            {isFranchisee && !isOwner && myFranchise && (
            <>
              <section className="panel-card">
                <div className="panel-head">
                  <h3>Create Franchise Poll</h3>
                  <span className={`chip ${!myFranchise.expired && !myFranchise.exhausted ? 'chip-success' : 'chip-warning'}`}>
                    {myFranchise.pollsUsed} / {myFranchise.maxPolls} polls used
                  </span>
                </div>
                {myFranchise.exhausted ? (
                  <div className="muted">You have used all your allocated polls.</div>
                ) : myFranchise.expired ? (
                  <div className="muted">Your franchise has expired.</div>
                ) : (
                  <form onSubmit={handleCreateFranchisePoll} className="form-stack">
                    <input
                      type="text" placeholder="Poll Title"
                      value={fpTitle}
                      onChange={e => { setFpTitle(e.target.value); setFpTitleDuplicateWarning(''); }}
                      onBlur={() => fpTitle.trim() && checkTitleDuplicate(fpTitle.trim(), setFpTitleDuplicateWarning)}
                      className={`form-input ${fpTitleDuplicateWarning ? 'input-warning' : ''}`}
                    />
                    {fpTitleDuplicateWarning && (
                      <div className="duplicate-warning">{fpTitleDuplicateWarning}</div>
                    )}
                    {existingPollNames.length > 0 && (
                      <details className="existing-names-list">
                        <summary className="muted small">View existing poll names ({existingPollNames.length})</summary>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                          {existingPollNames.map((n, i) => <span key={i} className="name-chip">{n}</span>)}
                        </div>
                      </details>
                    )}
                    <label className="form-label">Start Time</label>
                    <input
                      type="datetime-local"
                      value={fpStartTime} onChange={e => setFpStartTime(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">Leave blank to start {mode === 'local' ? '15 seconds' : '10 minutes'} from now. You must add candidates and voters <strong>before</strong> the poll starts.</div>
                    <label className="form-label">Duration (seconds)</label>
                    <input
                      type="number" min="60" placeholder="Duration in seconds"
                      value={fpDuration} onChange={e => setFpDuration(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">Suggested: 3600 (1h), 86400 (1d), 604800 (1w)</div>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={fpEnableToken} onChange={e => setFpEnableToken(e.target.checked)} />
                      Enable Token Voting
                    </label>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={fpRequireToken} onChange={e => setFpRequireToken(e.target.checked)} />
                      Require Token Voting
                    </label>
                    {myFranchise.feePerPoll !== '0.0' && (
                      <div className="muted small">Fee: {myFranchise.feePerPoll} ETH will be sent with this transaction.</div>
                    )}
                    <button type="submit" className="btn" disabled={loading}>
                      {loading ? 'Creating...' : 'Create Franchise Poll'}
                    </button>
                  </form>
                )}
              </section>
            </>
            )}

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Candidates & Voters                                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {addr && (isOwner || isFranchisee) && activeTab === 'participants' && polls.length > 0 && (
        <div className="admin-tab-content">
          <div className="admin-tab-grid">
            {/* Add Candidate */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Add Candidate</h3>
              </div>
              <form onSubmit={addCandidate} className="form-stack">
                <PollSelect
                  value={selectedPollId}
                  onChange={e => setSelectedPollId(e.target.value)}
                  filterFn={p => !p.ended}
                />
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

            {/* Add Voters */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Add Voters</h3>
              </div>
              <form onSubmit={addVoters} className="form-stack">
                <PollSelect
                  value={voterPollId}
                  onChange={e => setVoterPollId(e.target.value)}
                  filterFn={p => !p.ended}
                />
                <textarea
                  placeholder="Voter Addresses (comma-separated)"
                  value={voterAddresses}
                  onChange={e => setVoterAddresses(e.target.value)}
                  rows={4}
                  className="form-input form-textarea"
                />
                {voterPollId && (() => {
                  const selectedPoll = polls.find(p => String(p.id) === String(voterPollId));
                  if (!selectedPoll?.tokenConfig?.enabled) return null;
                  return (
                    <>
                      <div className="muted small">
                        Token voting enabled.
                        {selectedPoll.tokenConfig.tokenRequired ? ' Token required.' : ' Token optional.'}
                        {' '}Tokens/voter: {selectedPoll.tokenConfig.tokensPerVoter || 0}
                        {selectedPoll.tokenConfig.allowGaslessVoting ? ' • Gasless' : ''}
                      </div>
                      <input
                        type="number" min="1" placeholder="Fallback tokens per voter"
                        value={voterTokensPerVoter}
                        onChange={e => setVoterTokensPerVoter(e.target.value)}
                        className="form-input"
                      />
                    </>
                  );
                })()}
                {mode === 'local' && (
                  <button type="button" className="btn ghost btn-sm" onClick={copyVoterAddresses}>
                    Copy Test Voter Addresses (#1–#4)
                  </button>
                )}
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Adding...' : 'Add Voters'}
                </button>
              </form>
            </section>

            {/* Remove Voter */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Remove Voter</h3>
              </div>
              <form onSubmit={removeVoterFromPoll} className="form-stack">
                <PollSelect
                  value={removeVoterPollId}
                  onChange={e => setRemoveVoterPollId(e.target.value)}
                  filterFn={p => !p.ended}
                />
                <input
                  type="text" placeholder="Voter Address to remove"
                  value={removeVoterAddress} onChange={e => setRemoveVoterAddress(e.target.value)} className="form-input"
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Removing...' : 'Remove Voter'}
                </button>
              </form>
            </section>

            {/* Top Up Tokens */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Token Management</h3>
              </div>
              <form onSubmit={topUpVotingTokens} className="form-stack">
                <label className="form-label">Top Up Voting Tokens</label>
                <PollSelect
                  value={topUpPollId}
                  onChange={e => setTopUpPollId(e.target.value)}
                  filterFn={p => !p.ended}
                />
                <textarea
                  placeholder="Voter Addresses (comma-separated)"
                  value={topUpVoterAddresses}
                  onChange={e => setTopUpVoterAddresses(e.target.value)}
                  rows={3}
                  className="form-input form-textarea"
                />
                <input
                  type="number" min="1" placeholder="Top-up tokens per voter"
                  value={topUpAmountPerVoter}
                  onChange={e => setTopUpAmountPerVoter(e.target.value)}
                  className="form-input"
                />
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Topping Up...' : 'Top Up Tokens'}
                </button>
                {!isOwner && (
                  <div className="muted small">As a poll admin, token allocation uses addVotersWithTokens and only works <strong>before</strong> the poll starts.</div>
                )}
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <form onSubmit={checkVoterTokenBalance} className="form-stack">
                <label className="form-label">Check Token Balance</label>
                <PollSelect
                  value={balanceCheckPollId}
                  onChange={e => setBalanceCheckPollId(e.target.value)}
                  placeholder="Select Poll (Balance Check)"
                />
                <input
                  type="text" placeholder="Voter address"
                  value={balanceCheckVoterAddress}
                  onChange={e => setBalanceCheckVoterAddress(e.target.value)}
                  className="form-input"
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Checking...' : 'Check Balance'}
                </button>
              </form>
              {balanceCheckResult && (
                <div className="info-banner" style={{ marginTop: 10 }}>
                  Poll #{balanceCheckResult.pollId} &bull; {balanceCheckResult.voter} &bull; Balance: <strong>{balanceCheckResult.balance}</strong>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Poll Settings                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {addr && (isOwner || isFranchisee) && activeTab === 'settings' && polls.length > 0 && (
        <div className="admin-tab-content">
          <div className="admin-tab-grid">
            {/* Voting Modes */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Voting Modes</h3>
              </div>

              <form onSubmit={enableSecretBallotForPoll} className="form-stack">
                <label className="form-label">Secret Ballot <span className="muted small">(commit-reveal)</span></label>
                <PollSelect
                  value={secretBallotPollId}
                  onChange={e => setSecretBallotPollId(e.target.value)}
                  filterFn={p => !p.ended && !p.isSecretBallot}
                />
                <label className="form-label">Reveal Duration <span className="muted small">(minutes, default 60)</span></label>
                <input
                  type="number"
                  className="input"
                  placeholder="60"
                  min="1"
                  value={revealDurationMinutes}
                  onChange={e => setRevealDurationMinutes(e.target.value)}
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Enabling...' : 'Enable Secret Ballot'}
                </button>
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <form onSubmit={enableQuadraticForPoll} className="form-stack">
                <label className="form-label">Quadratic Voting <span className="muted small">(cost = votes²)</span></label>
                <PollSelect
                  value={quadraticPollId}
                  onChange={e => setQuadraticPollId(e.target.value)}
                  filterFn={p => !p.ended && !p.quadraticEnabled}
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Enabling...' : 'Enable Quadratic Voting'}
                </button>
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <form onSubmit={setMaxChoicesForPoll} className="form-stack">
                <label className="form-label">Multi-Choice Voting</label>
                <PollSelect
                  value={multiChoicePollId}
                  onChange={e => setMultiChoicePollId(e.target.value)}
                  filterFn={p => !p.ended}
                />
                <input
                  type="number" min="2" placeholder="Max choices per voter"
                  value={maxChoices} onChange={e => setMaxChoices(e.target.value)} className="form-input"
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Setting...' : 'Set Max Choices'}
                </button>
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <form onSubmit={enableDelegationForPoll} className="form-stack">
                <label className="form-label">Vote Delegation <span className="muted small">(allow voters to delegate)</span></label>
                <PollSelect
                  value={delegationPollId}
                  onChange={e => setDelegationPollId(e.target.value)}
                  filterFn={p => !p.ended && !p.delegationEnabled}
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Enabling...' : 'Enable Delegation'}
                </button>
              </form>
            </section>

            {/* Poll Metadata */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Poll Metadata</h3>
              </div>
              <form onSubmit={setPollMetadataURI} className="form-stack">
                <PollSelect
                  value={metadataPollId}
                  onChange={e => setMetadataPollId(e.target.value)}
                />
                <input
                  type="text" placeholder="Metadata URI (e.g. ipfs://... or https://...)"
                  value={metadataURI} onChange={e => setMetadataURI(e.target.value)} className="form-input"
                />
                <button type="submit" className="btn secondary" disabled={loading}>
                  {loading ? 'Setting...' : 'Set Metadata'}
                </button>
              </form>
            </section>

            {/* Transfer Franchise (franchisee page only) */}
            {isFranchiseeRole && isFranchisee && !isOwner && myFranchise && (
              <section className="panel-card">
                <div className="panel-head">
                  <h3>Transfer Franchise</h3>
                </div>
                {myFranchise.transferRequest.pending ? (
                  <div className="info-banner">
                    <div className="muted small">
                      <strong>Transfer pending</strong><br />
                      To: {myFranchise.transferRequest.newFranchisee}<br />
                      Fee paid: {myFranchise.transferRequest.feePaid} ETH<br />
                      Awaiting owner approval.
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleRequestTransfer} className="form-stack">
                    <input
                      type="text" placeholder="New Franchisee Address"
                      value={transferToAddress} onChange={e => setTransferToAddress(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">Transfer fee: {transferFee} ETH (paid with this transaction)</div>
                    <button type="submit" className="btn secondary" disabled={loading}>
                      {loading ? 'Requesting...' : 'Request Transfer'}
                    </button>
                  </form>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Franchises                                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {addr && (isOwner || isFranchisee) && activeTab === 'franchises' && (
        <div className="admin-tab-content">

          {/* ── Franchisee View (non-owner franchisee) ────────────────── */}
          {isFranchisee && !isOwner && myFranchise && (
            <>
              <div className="admin-tab-grid">
                {/* My Franchise Details */}
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>My Franchise #{myFranchiseId}</h3>
                    <span className={`chip ${!myFranchise.expired && !myFranchise.exhausted ? 'chip-success' : 'chip-warning'}`}>
                      {myFranchise.expired ? 'Expired' : myFranchise.exhausted ? 'Exhausted' : 'Active'}
                    </span>
                  </div>
                  <div className="meta-list">
                    <div><span>Franchisee</span><strong style={{ wordBreak: 'break-all', fontSize: 12 }}>{myFranchise.franchisee}</strong></div>
                    <div><span>Expires</span><strong>{new Date(myFranchise.expiresAt * 1000).toLocaleString()}</strong></div>
                    <div><span>Polls Used</span><strong>{myFranchise.pollsUsed} / {myFranchise.maxPolls}</strong></div>
                    <div><span>Remaining Polls</span><strong>{myFranchise.maxPolls - myFranchise.pollsUsed}</strong></div>
                    <div><span>Fee Per Poll</span><strong>{myFranchise.feePerPoll === '0.0' ? 'Free' : `${myFranchise.feePerPoll} ETH`}</strong></div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-sm secondary" onClick={loadFranchises} disabled={loading}>Refresh</button>
                  </div>
                </section>

                {/* Quick Links */}
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>Quick Actions</h3>
                  </div>
                  <div className="form-stack">
                    <button className="btn" onClick={() => setActiveTab('create')} disabled={myFranchise.exhausted || myFranchise.expired}>
                      + Create New Poll
                    </button>
                    <button className="btn secondary" onClick={() => setActiveTab('participants')}>
                      Manage Candidates & Voters
                    </button>
                    <button className="btn secondary" onClick={() => setActiveTab('settings')}>
                      Poll Settings
                    </button>
                  </div>
                </section>
              </div>

              {/* Request Transfer */}
              <section className="panel-card" style={{ marginTop: 'var(--grid-gap)' }}>
                <div className="panel-head">
                  <h3>Transfer Franchise</h3>
                </div>
                {myFranchise.transferRequest.pending ? (
                  <div className="info-banner">
                    <div className="muted small">
                      <strong>Transfer pending</strong><br />
                      To: {myFranchise.transferRequest.newFranchisee}<br />
                      Fee paid: {myFranchise.transferRequest.feePaid} ETH<br />
                      Awaiting owner approval.
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleRequestTransfer} className="form-stack">
                    <input
                      type="text" placeholder="New Franchisee Address"
                      value={transferToAddress} onChange={e => setTransferToAddress(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">Transfer fee: {transferFee} ETH (paid with this transaction)</div>
                    <button type="submit" className="btn secondary" disabled={loading}>
                      {loading ? 'Requesting...' : 'Request Transfer'}
                    </button>
                  </form>
                )}
              </section>
            </>
          )}

          {/* ── Franchisee notice for non-franchisee non-owner ──────── */}
          {!isFranchisee && !isOwner && (
            <div className="empty-state">
              You don't have a franchise. Contact the contract owner to be granted one.
            </div>
          )}

          {/* ── Owner View ────────────────────────────────────────────── */}
          {isOwner && (
            <>
              <div className="admin-tab-grid">
                {/* Grant Franchise */}
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>Grant Franchise</h3>
                  </div>
                  <form onSubmit={handleGrantFranchise} className="form-stack">
                    <input
                      type="text" placeholder="Franchisee Address"
                      value={grantFranchisee} onChange={e => setGrantFranchisee(e.target.value)}
                      className="form-input"
                    />
                    <label className="form-label">Duration (seconds)</label>
                    <input
                      type="number" min="1" placeholder="Duration (seconds)"
                      value={grantDuration} onChange={e => setGrantDuration(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">Suggested: 2592000 (30 days), 7776000 (90 days), 31536000 (1 year)</div>
                    <label className="form-label">Max Polls</label>
                    <input
                      type="number" min="1" placeholder="Maximum polls"
                      value={grantMaxPolls} onChange={e => setGrantMaxPolls(e.target.value)}
                      className="form-input"
                    />
                    <label className="form-label">Fee Per Poll (ETH, 0 = free)</label>
                    <input
                      type="text" placeholder="Fee per poll in ETH (e.g. 0.01, 0 = free)"
                      value={grantFeePerPoll} onChange={e => setGrantFeePerPoll(e.target.value)}
                      className="form-input"
                    />
                    <label className="form-label">Custom VotingPaymaster <span className="muted small">(optional, blank = use global)</span></label>
                    <input
                      type="text" placeholder="0x... (leave blank for default gas sponsor)"
                      value={grantPaymaster} onChange={e => setGrantPaymaster(e.target.value)}
                      className="form-input"
                    />
                    <div className="muted small">If set, this franchisee's polls will use the specified paymaster for gasless vote sponsorship instead of the global one.</div>
                    <button type="submit" className="btn" disabled={loading}>
                      {loading ? 'Granting...' : 'Grant Franchise'}
                    </button>
                  </form>
                  <hr style={{ margin: '16px 0', opacity: 0.1 }} />
                  <div className="panel-head" style={{ marginBottom: 8 }}>
                    <h4>Add Polls to Franchise</h4>
                  </div>
                  <form onSubmit={handleAddPolls} className="form-stack">
                    <select
                      value={addPollsFranchiseId}
                      onChange={e => setAddPollsFranchiseId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">Select Franchise</option>
                      {franchises.map(f => (
                        <option key={f.id} value={f.id}>
                          #{f.id}: {f.franchisee.slice(0, 8)}... ({f.pollsUsed}/{f.maxPolls} used)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number" min="1" placeholder="Additional polls to add"
                      value={addPollsCount} onChange={e => setAddPollsCount(e.target.value)}
                      className="form-input"
                    />
                    <button type="submit" className="btn secondary" disabled={loading}>
                      {loading ? 'Adding...' : 'Add Polls'}
                    </button>
                  </form>
                </section>

                {/* Transfer Fee & Withdraw */}
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>Fees & Revenue</h3>
                  </div>
                  <div className="meta-list">
                    <div>
                      <span>Current Transfer Fee</span>
                      <strong>{transferFee} ETH</strong>
                    </div>
                    <div>
                      <span>FranchiseManager Address</span>
                      <strong style={{ fontSize: 12 }}>{franchiseManagerAddr || 'Loading...'}</strong>
                    </div>
                  </div>
                  <form onSubmit={handleSetTransferFee} className="form-stack">
                    <input
                      type="text" placeholder="New transfer fee (ETH)"
                      value={newTransferFee} onChange={e => setNewTransferFee(e.target.value)}
                      className="form-input"
                    />
                    <button type="submit" className="btn secondary" disabled={loading}>
                      {loading ? 'Setting...' : 'Set Transfer Fee'}
                    </button>
                  </form>
                  <hr style={{ margin: '16px 0', opacity: 0.1 }} />
                  <div className="meta-list" style={{ marginBottom: '12px' }}>
                    <div className="meta-item">
                      <span>Accumulated Fees</span>
                      <strong>{fmBalance} ETH</strong>
                    </div>
                  </div>
                  <button className="btn" onClick={handleWithdrawFees} disabled={loading || fmBalance === '0.0' || fmBalance === '0'}>
                    {loading ? 'Withdrawing...' : `Withdraw All Fees (${fmBalance} ETH)`}
                  </button>
                </section>
              </div>

              {/* Owner's own franchise (if owner is also a franchisee) */}
              {isFranchisee && myFranchise && (
                <section className="panel-card" style={{ marginTop: 'var(--grid-gap)' }}>
                  <div className="panel-head">
                    <h3>My Franchise #{myFranchiseId}</h3>
                    <span className={`chip ${!myFranchise.expired && !myFranchise.exhausted ? 'chip-success' : 'chip-warning'}`}>
                      {myFranchise.expired ? 'Expired' : myFranchise.exhausted ? 'Exhausted' : 'Active'}
                    </span>
                  </div>
                  <div className="meta-list">
                    <div><span>Polls Used</span><strong>{myFranchise.pollsUsed} / {myFranchise.maxPolls}</strong></div>
                    <div><span>Remaining</span><strong>{myFranchise.maxPolls - myFranchise.pollsUsed}</strong></div>
                    <div><span>Expires</span><strong>{new Date(myFranchise.expiresAt * 1000).toLocaleString()}</strong></div>
                  </div>
                </section>
              )}

              {/* Franchise List */}
              {franchises.length > 0 && (
                <section className="panel-card panel-card--wide" style={{ marginTop: 'var(--grid-gap)' }}>
                  <div className="panel-head">
                    <h3>Franchises ({filteredFranchises.length} of {franchises.length})</h3>
                    <button className="btn btn-sm secondary" onClick={loadFranchises} disabled={loading}>Refresh</button>
                  </div>

                  <SearchBar
                    searchTerm={franchiseSearch}
                    onSearchChange={setFranchiseSearch}
                    placeholder="Search by address or ID…"
                  />

                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Franchisee</th>
                          <th>Status</th>
                          <th>Expires</th>
                          <th>Polls Used</th>
                          <th>Remaining</th>
                          <th>Fee/Poll</th>
                          <th>Transfer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {franchisesPage.map(f => {
                          const isActive = !f.expired && !f.exhausted;
                          const remaining = f.maxPolls - f.pollsUsed;
                          return (
                            <tr key={f.id}>
                              <td>{f.id}</td>
                              <td className="muted small" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.franchisee}</td>
                              <td><span className={`chip ${isActive ? 'chip-success' : 'chip-warning'}`}>{f.expired ? 'Expired' : f.exhausted ? 'Exhausted' : 'Active'}</span></td>
                              <td>{new Date(f.expiresAt * 1000).toLocaleDateString()}</td>
                              <td>{f.pollsUsed} / {f.maxPolls}</td>
                              <td>{remaining}</td>
                              <td>{f.feePerPoll} ETH</td>
                              <td>
                                {f.transferRequest.pending ? (
                                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span className="muted small">To: {f.transferRequest.newFranchisee.slice(0, 8)}…</span>
                                    <button className="btn btn-sm" onClick={() => handleApproveTransfer(f.id)} disabled={loading}>Approve</button>
                                    <button className="btn btn-sm secondary" onClick={() => handleRejectTransfer(f.id)} disabled={loading}>Reject</button>
                                  </div>
                                ) : (
                                  <span className="muted small">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {franchisesPage.length === 0 && (
                          <tr><td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem' }}>No franchises match your search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    totalItems={filteredFranchises.length}
                    page={franchisePage}
                    pageSize={franchisePageSize}
                    onPageChange={setFranchisePage}
                    onPageSizeChange={(s) => { setFranchisePageSize(s); setFranchisePage(1); }}
                  />
                </section>
              )}

              {franchises.length === 0 && (
                <div className="empty-state" style={{ marginTop: 'var(--grid-gap)' }}>
                  No franchises granted yet. Use the form above to grant one.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Infrastructure                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {addr && isOwner && activeTab === 'infra' && (
        <div className="admin-tab-content">
          <div className="admin-tab-grid">
            {/* Ownership */}
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
                    <button type="button" className="btn secondary" onClick={cancelOwnershipTransfer} disabled={loading}>
                      {loading ? 'Canceling...' : 'Cancel Transfer'}
                    </button>
                  )}
                </div>
              </form>

              {pendingOwner && pendingOwner !== ethers.ZeroAddress && (
                <div className="form-actions" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={acceptOwnership} disabled={loading || !isPendingOwner}>
                    {loading ? 'Accepting...' : 'Accept Ownership'}
                  </button>
                  {!isPendingOwner && (
                    <div className="muted small">Connect with the pending owner address to accept.</div>
                  )}
                </div>
              )}
            </section>

            {/* Gas Sponsorship */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Gas Sponsorship</h3>
              </div>
              <div className="meta-list">
                <div>
                  <span>Paymaster status</span>
                  <strong>
                    <span className={`chip ${paymasterStatus.configured ? (paymasterStatus.deployed ? 'chip-success' : 'chip-warning') : ''}`}>
                      {!paymasterStatus.configured
                        ? 'Not configured'
                        : paymasterStatus.deployed
                        ? 'Configured & active'
                        : 'Configured but not deployed'}
                    </span>
                  </strong>
                </div>
                <div>
                  <span>Network</span>
                  <strong>
                    {paymasterStatus.networkName}
                    {Number.isFinite(paymasterStatus.chainId) ? ` (${paymasterStatus.chainId})` : ''}
                  </strong>
                </div>
              </div>
              <form onSubmit={setVotingPaymaster} className="form-stack">
                <input
                  type="text"
                  placeholder="Voting Paymaster Address"
                  value={paymasterAddress}
                  onChange={e => setPaymasterAddress(e.target.value)}
                  className="form-input"
                />
                <div className="muted small">
                  Set this to enable sponsor-paid gas for polls with gasless token voting.
                </div>
                {paymasterStatus.configured && !paymasterStatus.deployed && (
                  <div className="muted small" style={{ color: 'var(--danger)' }}>
                    Warning: this paymaster address has no contract code on the current network.
                  </div>
                )}
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Saving...' : 'Set Paymaster'}
                </button>
              </form>
            </section>

            {/* Contract Addresses */}
            <section className="panel-card">
              <div className="panel-head">
                <h3>Contract Addresses</h3>
                <span className={`chip ${infraLocked ? 'chip-warning' : 'chip-success'}`}>
                  {infraLocked ? 'Locked' : 'Unlocked'}
                </span>
              </div>

              <form onSubmit={setSecretBallotManagerAddress} className="form-stack">
                <label className="form-label">SecretBallotManager</label>
                <input
                  type="text" placeholder="SecretBallotManager Address"
                  value={sbmAddress} onChange={e => setSbmAddress(e.target.value)}
                  className="form-input" disabled={infraLocked}
                />
                <button type="submit" className="btn secondary" disabled={loading || infraLocked}>
                  {loading ? 'Setting...' : 'Update'}
                </button>
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <form onSubmit={setTokenManagerAddress} className="form-stack">
                <label className="form-label">TokenManager</label>
                <input
                  type="text" placeholder="TokenManager Address"
                  value={tokenMgrAddress} onChange={e => setTokenMgrAddress(e.target.value)}
                  className="form-input" disabled={infraLocked}
                />
                <button type="submit" className="btn secondary" disabled={loading || infraLocked}>
                  {loading ? 'Setting...' : 'Update'}
                </button>
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <form onSubmit={handleSetFranchiseManager} className="form-stack">
                <label className="form-label">FranchiseManager</label>
                <input
                  type="text" placeholder="FranchiseManager Address"
                  value={fmAddrInput} onChange={e => setFmAddrInput(e.target.value)}
                  className="form-input" disabled={infraLocked}
                />
                <button type="submit" className="btn secondary" disabled={loading || infraLocked}>
                  {loading ? 'Setting...' : 'Update'}
                </button>
              </form>

              <hr style={{ margin: '16px 0', opacity: 0.1 }} />

              <div className="form-stack">
                <div className="meta-list">
                  <div>
                    <span>Infrastructure Lock</span>
                    <strong>
                      <span className={`chip ${infraLocked ? 'chip-warning' : 'chip-success'}`}>
                        {infraLocked ? 'Locked (permanent)' : 'Unlocked'}
                      </span>
                    </strong>
                  </div>
                </div>
                {!infraLocked && (
                  <>
                    <div className="muted small" style={{ color: 'var(--danger)' }}>
                      Locking infrastructure is <strong>irreversible</strong>. It prevents changes to TokenManager, SecretBallotManager, FranchiseManager, and Paymaster addresses.
                    </div>
                    <button className="btn secondary" onClick={lockInfra} disabled={loading}>
                      {loading ? 'Locking...' : 'Lock Infrastructure'}
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
