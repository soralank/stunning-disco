import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getProvider, getSigner, getContract, getContractErrorDetails, sendTxWithNonceRetry, getSecretBallotManagerContract, getVotingPaymasterContract, getVotingPaymasterAt, getVotingReaderContract, resolveIpfsUri } from '../contract';
import { ethers } from 'ethers';
import Pagination from './Pagination';
import SearchBar from './SearchBar';

// Read from env or use hardcoded defaults
const DEFAULT_ACCOUNTS = [
  { name: 'Account #0', key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
  { name: 'Account #1', key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  { name: 'Account #2', key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
  { name: 'Account #3', key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' },
  { name: 'Account #4', key: '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0', address: '0x2546bcd3c84621e976d8185a91a922ae77ecec30' }
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

export default function VoteList({ mode = 'production' }) {
  const [addr, setAddr] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [expandedPoll, setExpandedPoll] = useState(null);
  const [walletSigner, setWalletSigner] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(1);
  const [, setTick] = useState(0); // Force re-render for live countdown

  // Delegation state
  const [delegateAddress, setDelegateAddress] = useState('');

  // Secret ballot state — persisted to localStorage so salts survive page refreshes
  const [commitSalt, setCommitSaltRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem('__sb_salts') || '{}'); } catch { return {}; }
  });
  const [revealOptionId, setRevealOptionIdRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem('__sb_options') || '{}'); } catch { return {}; }
  });
  // Wrapper setters that sync to localStorage
  const setCommitSalt = (updater) => {
    setCommitSaltRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('__sb_salts', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const setRevealOptionId = (updater) => {
    setRevealOptionIdRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('__sb_options', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Quadratic voting state
  const [quadraticAllocations, setQuadraticAllocations] = useState({}); // { pollId: { optionId: amount } }

  // Multi-choice voting state
  const [multiChoiceSelections, setMultiChoiceSelections] = useState({}); // { pollId: Set<optionId> }

  // Search & pagination
  const [voterSearch, setVoterSearch] = useState('');
  const [voterStatusFilter, setVoterStatusFilter] = useState('all');
  const [voterPage, setVoterPage] = useState(1);
  const [voterPageSize, setVoterPageSize] = useState(10);

  const filteredVoterPolls = useMemo(() => {
    let list = polls;
    if (voterSearch.trim()) {
      const q = voterSearch.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || String(p.id).includes(q));
    }
    if (voterStatusFilter !== 'all') {
      const nowTs = Math.floor(Date.now() / 1000);
      list = list.filter(p => {
        const st = p.status || {};
        const ended = Boolean(st.ended || (p.endTime && nowTs >= p.endTime));
        const started = p.startTime ? nowTs >= p.startTime : true;
        if (voterStatusFilter === 'active') return !ended && started;
        if (voterStatusFilter === 'ended') return ended && !st.revealed;
        if (voterStatusFilter === 'revealed') return !!st.revealed;
        if (voterStatusFilter === 'voted') return !!p.hasVoted;
        return true;
      });
    }
    return list;
  }, [polls, voterSearch, voterStatusFilter]);

  const voterPollsPage = useMemo(() => {
    const start = (voterPage - 1) * voterPageSize;
    return filteredVoterPolls.slice(start, start + voterPageSize);
  }, [filteredVoterPolls, voterPage, voterPageSize]);

  // ── Helper: get a signer for any Hardhat account by address (local mode) ──
  function getSignerForAccount(voterAddr) {
    if (mode !== 'local') return null;
    const account = HARDHAT_ACCOUNTS.find(a => a.address.toLowerCase() === voterAddr.toLowerCase());
    if (!account) return null;
    const provider = getEffectiveProvider();
    return new ethers.Wallet(account.key, provider);
  }

  // ── Helper: withdraw from paymaster using its admin account ──
  // Queries paymasterContract.admin() to find the right signer, then withdraws.
  // Returns { success: boolean, adminAddress: string|null }
  async function _withdrawFromPaymasterAsAdmin(paymasterAddress, amount, relayerSigner) {
    const pmAbi = require('../contract/votingPaymaster.abi.json');
    const provider = getEffectiveProvider();

    // 1) Query who the paymaster admin is
    const pmReadOnly = new ethers.Contract(paymasterAddress, pmAbi, provider);
    let adminAddr;
    try {
      adminAddr = await pmReadOnly.admin();
    } catch (err) {
      console.warn('Could not query paymaster admin():', err.message?.substring(0, 100));
      return { success: false, adminAddress: null };
    }

    console.log(`Paymaster admin is: ${adminAddr}`);

    // 2) Find matching Hardhat account key for the admin
    const adminAccount = HARDHAT_ACCOUNTS.find(
      a => a.address.toLowerCase() === adminAddr.toLowerCase()
    );

    if (!adminAccount) {
      console.error(`❌ Paymaster admin ${adminAddr} not found in HARDHAT_ACCOUNTS — cannot withdraw. Relayer will absorb cost.`);
      return { success: false, adminAddress: adminAddr };
    }

    // 3) Withdraw as admin
    const adminSigner = new ethers.Wallet(adminAccount.key, provider);
    const pmAsAdmin = new ethers.Contract(paymasterAddress, pmAbi, adminSigner);
    try {
      const withdrawTx = await pmAsAdmin.withdraw(amount);
      await withdrawTx.wait();
      console.log(`✅ Withdrew ${ethers.formatEther(amount)} ETH from paymaster as admin (${adminAccount.name})`);
    } catch (withdrawErr) {
      console.error(`❌ Paymaster withdraw failed as admin ${adminAddr}:`, withdrawErr.message?.substring(0, 200));
      return { success: false, adminAddress: adminAddr };
    }

    // 4) If admin is not the relayer, forward the ETH to the relayer
    const relayerAddress = await relayerSigner.getAddress();
    if (adminAddr.toLowerCase() !== relayerAddress.toLowerCase()) {
      try {
        const fwdTx = await adminSigner.sendTransaction({ to: relayerAddress, value: amount });
        await fwdTx.wait();
        console.log(`✅ Forwarded ${ethers.formatEther(amount)} ETH from admin → relayer`);
      } catch (fwdErr) {
        console.error('Failed to forward ETH from admin to relayer:', fwdErr.message?.substring(0, 100));
        return { success: false, adminAddress: adminAddr };
      }
    }

    return { success: true, adminAddress: adminAddr };
  }

  // ── Reveal a single secret ballot vote (used by auto-reveal and manual button) ──
  async function revealSecretVote(pollId, optionId, salt, voterAddr) {
    // Get the right signer: if local mode, use the matching Hardhat account
    let signer;
    if (mode === 'local') {
      signer = getSignerForAccount(voterAddr);
      if (!signer) throw new Error(`No local signer for ${voterAddr}`);
    } else {
      signer = walletSigner || await getSigner();
    }
    const sbmSigner = getSecretBallotManagerContract(signer);
    const tx = await sendTxWithNonceRetry({
      signer,
      sendTx: (overrides = {}) => sbmSigner.revealVote(pollId, optionId, salt, overrides),
      onRetry: () => console.log(`[Reveal] Retrying for poll #${pollId}, voter ${voterAddr.slice(0, 8)}...`)
    });
    await tx.wait();
    return tx;
  }

  // ── Manual reveal handler (called from UI button) ──
  async function handleManualReveal(pollId) {
    setStatus(null);
    try {
      let salts, options;
      try {
        salts = JSON.parse(localStorage.getItem('__sb_salts') || '{}');
        options = JSON.parse(localStorage.getItem('__sb_options') || '{}');
      } catch { setStatus('Error: Could not read saved vote data'); return; }

      // In local mode, reveal for ALL accounts that have pending reveals for this poll
      const keysForPoll = Object.keys(salts).filter(k => {
        const [pidStr] = k.split('_');
        return Number(pidStr) === Number(pollId) && salts[k] && options[k] != null;
      });

      if (keysForPoll.length === 0) {
        setStatus('No pending secret votes found for this poll. Votes may have already been revealed.');
        return;
      }

      let revealed = 0;
      let failed = 0;
      for (const key of keysForPoll) {
        const [, voterAddr] = key.split('_');
        const salt = salts[key];
        const optId = options[key];
        try {
          const provider = getEffectiveProvider();
          const sbmRead = getSecretBallotManagerContract(provider);
          const alreadyRevealed = await sbmRead.hasRevealed(pollId, voterAddr);
          if (alreadyRevealed) {
            setCommitSalt(prev => { const n = { ...prev }; delete n[key]; return n; });
            setRevealOptionId(prev => { const n = { ...prev }; delete n[key]; return n; });
            revealed++;
            continue;
          }
          setStatus(`Revealing vote for ${voterAddr.slice(0, 8)}... (${revealed + 1}/${keysForPoll.length})`);
          await revealSecretVote(pollId, optId, salt, voterAddr);
          setCommitSalt(prev => { const n = { ...prev }; delete n[key]; return n; });
          setRevealOptionId(prev => { const n = { ...prev }; delete n[key]; return n; });
          revealed++;
          console.log(`[Manual reveal] Revealed for ${voterAddr.slice(0, 10)} on poll #${pollId}`);
        } catch (err) {
          failed++;
          console.warn(`[Manual reveal] Failed for ${voterAddr.slice(0, 10)} on poll #${pollId}:`, err.message?.substring(0, 150));
        }
      }
      if (failed > 0) {
        setStatus(`Revealed ${revealed} vote(s), ${failed} failed (check console). The reveal window may have closed.`);
      } else {
        setStatus(`✅ Revealed ${revealed} vote(s) for poll #${pollId}!`);
      }
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    }
  }

  // ── Auto-reveal effect: runs every 5s, checks for pending reveals ──────
  useEffect(() => {
    if (!addr) return;
    let cancelled = false;
    const TIME_BUFFER = 30; // must match contract TIME_BUFFER

    async function tryAutoReveal() {
      let salts, options;
      try {
        salts = JSON.parse(localStorage.getItem('__sb_salts') || '{}');
        options = JSON.parse(localStorage.getItem('__sb_options') || '{}');
      } catch { return; }

      const pendingKeys = Object.keys(salts).filter(k => k.includes('_'));
      if (pendingKeys.length === 0) return;

      const provider = getEffectiveProvider();
      const contract = getContract(provider);
      const sbmRead = getSecretBallotManagerContract(provider);

      for (const key of pendingKeys) {
        if (cancelled) break;
        const [pollIdStr, voterAddr] = key.split('_');

        // In local mode, process ALL accounts (we have their keys).
        // In production, only process the current connected address.
        if (mode !== 'local' && voterAddr.toLowerCase() !== addr.toLowerCase()) continue;

        const pollId = Number(pollIdStr);
        const salt = salts[key];
        const optId = options[key];
        if (!salt || optId == null) continue;

        try {
          const alreadyRevealed = await sbmRead.hasRevealed(pollId, voterAddr);
          if (alreadyRevealed) {
            // Clean up — already done
            setCommitSalt(prev => { const n = { ...prev }; delete n[key]; return n; });
            setRevealOptionId(prev => { const n = { ...prev }; delete n[key]; return n; });
            continue;
          }

          const hasCommitted = await sbmRead.hasCommitted(pollId, voterAddr);
          if (!hasCommitted) continue;

          // Check if poll has ended AND TIME_BUFFER has elapsed (contract requirement)
          const poll = await contract.polls(pollId);
          const endTime = Number(poll.endTime);
          const nowTs = Math.floor(Date.now() / 1000);
          if (nowTs < endTime + TIME_BUFFER) continue; // not yet in reveal window

          // Check reveal window hasn't closed
          const revealDuration = Number(await sbmRead.getRevealDuration(pollId));
          if (nowTs > endTime + TIME_BUFFER + revealDuration) {
            console.warn(`[Auto-reveal] Reveal window closed for poll #${pollId}, voter ${voterAddr.slice(0, 10)}`);
            continue; // don't waste gas on a doomed tx
          }

          // Attempt the reveal
          console.log(`[Auto-reveal] Attempting reveal for poll #${pollId}, voter ${voterAddr.slice(0, 10)}...`);
          await revealSecretVote(pollId, optId, salt, voterAddr);
          console.log(`[Auto-reveal] Successfully revealed vote for poll #${pollId}, voter ${voterAddr.slice(0, 10)}`);
          setCommitSalt(prev => { const n = { ...prev }; delete n[key]; return n; });
          setRevealOptionId(prev => { const n = { ...prev }; delete n[key]; return n; });
          // Refresh polls to show updated state
          if (!cancelled) await loadPolls(addr);
        } catch (err) {
          console.warn(`[Auto-reveal] Failed for poll #${pollId}:`, err.message?.substring(0, 150));
        }
      }
    }

    // Run immediately on connect, then every 5 seconds
    tryAutoReveal();
    const interval = setInterval(tryAutoReveal, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [addr, walletSigner, mode]); // eslint-disable-line

  async function connectWallet() {
    setStatus(null);
    try {
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAddr(address);
      setExpandedPoll(null);
      setPolls([]);
      setWalletSigner(null);
      setStatus(`Connected: ${address}`);
      await loadPolls(address);
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
      setExpandedPoll(null);
      setPolls([]);
      setStatus(`Connected with ${account.name}: ${address}`);

      // Pass wallet.provider explicitly since walletSigner state hasn't updated yet
      await loadPolls(address, wallet.provider);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  // Use local wallet signer's provider when available (avoids MetaMask intercepting calls in local mode).
  // Accept an optional explicit provider to avoid stale React state during connect flows.
  function getEffectiveProvider(explicitProvider) {
    return explicitProvider || walletSigner?.provider || getProvider();
  }

  async function loadPolls(voterAddress, explicitProvider) {
    setLoading(true);
    try {
      const provider = getEffectiveProvider(explicitProvider);
      const contract = getContract(provider);
      
      let pollsCount = 0;
      try {
        const result = await contract.pollsCount();
        pollsCount = Number(result);
      } catch (e1) {
        if (e1.code === 'BAD_DATA' && e1.value === '0x') {
          console.warn('pollsCount() returned empty data - treating as 0');
          pollsCount = 0;
        } else {
          try {
            const result = await contract.getPollsCount();
            pollsCount = Number(result);
          } catch (e2) {
              console.error('Cannot read pollsCount — tried pollsCount() and getPollsCount()');
              setStatus('Error: Cannot read polls from contract');
              setLoading(false);
              return;
          }
        }
      }

      console.log('Loading polls for voter:', voterAddress, '- Total polls:', pollsCount);
      const pollsData = [];
      let skippedNotAuthorized = 0;

      for (let i = 1; i <= pollsCount; i++) {
        try {
          const poll = await contract.polls(i);
          
          if (!poll || !poll.exists) {
            continue;
          }
          
          let status;
          const isAuthorized = await contract.isVoterAuthorized(i, voterAddress);
          const hasVoted = await contract.hasVoterVoted(i, voterAddress);
          const totalVotes = await contract.getTotalVotes(i);
          const optionsCount = await contract.getOptionsCount(i);
          let tokenConfig = {
            enabled: false,
            tokenRequired: false,
            tokensPerVoter: 0,
            allowGaslessVoting: false
          };

          // Use the poll struct's tokenVotingEnabled as the source of truth
          // (set by createPoll). getTokenConfig() can return stale/default values.
          const pollTokenEnabled = Boolean(poll.tokenVotingEnabled ?? poll[9] ?? false);
          const pollTokenRequired = Boolean(poll.tokenVotingRequired ?? poll[10] ?? false);

          try {
            const rawTokenConfig = await contract.getTokenConfig(i);
            tokenConfig = {
              enabled: pollTokenEnabled && (rawTokenConfig?.enabled ?? rawTokenConfig?.[0] ?? false),
              tokenRequired: pollTokenRequired && (rawTokenConfig?.tokenRequired ?? rawTokenConfig?.[1] ?? false),
              tokensPerVoter: pollTokenEnabled ? Number(rawTokenConfig?.tokensPerVoter ?? rawTokenConfig?.[2] ?? 0) : 0,
              // Gasless is independent of token voting — read it directly from the config
              allowGaslessVoting: rawTokenConfig?.allowGaslessVoting ?? rawTokenConfig?.[3] ?? false
            };
          } catch {
            // If getTokenConfig fails, fall back to poll struct flags with safe defaults
            if (pollTokenEnabled) {
              tokenConfig = { enabled: true, tokenRequired: pollTokenRequired, tokensPerVoter: 0, allowGaslessVoting: false };
            }
          }

          let voterTokenBalance = 0;
          if (tokenConfig.enabled) {
            try {
              voterTokenBalance = Number(await contract.getVoterTokenBalance(i, voterAddress));
            } catch {
            }
          }

          const endTime = Number(poll.endTime);
          const nowTs = Math.floor(Date.now() / 1000);
          const startTime = Number(poll.startTime);

          try {
            const rawStatus = await contract.getPollStatus(i);
            status = {
              started: rawStatus?.started ?? rawStatus?.[0],
              active: rawStatus?.active ?? rawStatus?.[1],
              ended: rawStatus?.ended ?? rawStatus?.[2],
              revealed: rawStatus?.revealed ?? rawStatus?.[3]
            };
          } catch (statusErr) {
            const isActiveFallback = await contract.isPollActive(i);
            const startedFallback = startTime ? startTime <= nowTs : isActiveFallback;
            status = {
              started: startedFallback,
              active: isActiveFallback,
              ended: poll.ended || (endTime && endTime <= nowTs),
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

          const isExpired = status.ended;

          if (!isAuthorized) {
            skippedNotAuthorized++;
            continue;
          }

          // Skip revealed polls — voters can view those in the Results section
          if (status.revealed) {
            continue;
          }

          pollsData.push({
            id: i,
            title: poll.title,
            admin: poll.admin,
            startTime,
            endTime,
            revealed: status.revealed,
            ended: status.ended,
            status,
            hasVoted,
            totalVotes: Number(totalVotes),
            optionsCount: Number(optionsCount),
            tokenConfig,
            voterTokenBalance
          });

          // Augment with new feature flags
          const lastPoll = pollsData[pollsData.length - 1];
          try { lastPoll.isSecretBallot = await contract.secretBallot(i); } catch { lastPoll.isSecretBallot = false; }
          try {
            const reader = getVotingReaderContract(provider);
            lastPoll.quadraticEnabled = await reader.isQuadraticVotingEnabled(i);
          } catch { lastPoll.quadraticEnabled = false; }
          try {
            const reader = getVotingReaderContract(provider);
            lastPoll.maxChoices = Number(await reader.getPollMaxChoices(i));
          } catch { lastPoll.maxChoices = 0; }
          try { lastPoll.metadataURI = await contract.getPollMetadata(i); } catch { lastPoll.metadataURI = ''; }
          try {
            const pmAddr = await contract.pollVotingPaymaster(i);
            lastPoll.pollPaymaster = (pmAddr && pmAddr !== ethers.ZeroAddress) ? pmAddr : null;
          } catch { lastPoll.pollPaymaster = null; }

          // Delegation info
          try {
            const delegInfo = await contract.getDelegationInfo(i, voterAddress);
            lastPoll.delegation = {
              delegatee: delegInfo.delegatee || delegInfo[0],
              isDelegated: delegInfo.isDelegated ?? delegInfo[1],
              delegationsReceived: Number(delegInfo.delegationsReceived ?? delegInfo[2] ?? 0)
            };
          } catch { lastPoll.delegation = null; }

          // Secret ballot voter status
          if (lastPoll.isSecretBallot) {
            try {
              const sbmContract = getSecretBallotManagerContract(provider);
              lastPoll.hasCommitted = await sbmContract.hasCommitted(i, voterAddress);
              lastPoll.hasRevealed = await sbmContract.hasRevealed(i, voterAddress);
              const sbStatus = await sbmContract.getSecretBallotStatus(i);
              lastPoll.sbStatus = {
                commits: Number(sbStatus.commits ?? sbStatus[0]),
                reveals: Number(sbStatus.reveals ?? sbStatus[1]),
                inCommitPhase: sbStatus.inCommitPhase ?? sbStatus[3],
                inRevealPhase: sbStatus.inRevealPhase ?? sbStatus[4]
              };
              try { lastPoll.revealDeadline = Number(await sbmContract.getRevealDeadline(i)); } catch { lastPoll.revealDeadline = 0; }
              // Auto-reveal is handled by the dedicated useEffect timer — not inline here
            } catch (sbErr) {
              console.warn('SBM status error for poll', i, sbErr.message);
              lastPoll.hasCommitted = false;
              lastPoll.hasRevealed = false;
              lastPoll.sbStatus = null;
            }
          }

        } catch (pollErr) {
          console.warn(`Failed to load poll #${i}:`, pollErr.message);
        }
      }

      console.log(`Found ${pollsData.length} authorized polls for this voter (${skippedNotAuthorized} not authorized, ${pollsCount} total on-chain)`);
      if (pollsData.length === 0 && pollsCount > 0) {
        console.warn('Polls exist on-chain but none are visible. The admin needs to authorize this address as a voter.');
      }
      setPolls(pollsData);
    } catch (err) {
      setStatus(`Error loading polls: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadPollOptions(pollId) {
    try {
      const provider = getEffectiveProvider();
      const contract = getContract(provider);
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

      return options;
    } catch (err) {
      console.error('Error loading poll options:', err);
      return [];
    }
  }

  async function loadWinner(pollId) {
    try {
      const provider = getEffectiveProvider();
      const contract = getContract(provider);
      const winner = await contract.getWinner(pollId);

      return {
        id: Number(winner[0]),
        name: winner[1],
        votes: Number(winner[2])
      };
    } catch (err) {
      console.error('Error loading winner:', err);
      return null;
    }
  }

  // Detect ties: multiple candidates sharing the highest vote count
  function detectTie(options) {
    if (!options || options.length === 0) return null;
    const maxVotes = Math.max(...options.map(o => o.votes ?? 0));
    if (maxVotes === 0) return null;
    const topCandidates = options.filter(o => (o.votes ?? 0) === maxVotes);
    if (topCandidates.length > 1) {
      return { isTie: true, votes: maxVotes, candidates: topCandidates };
    }
    return null;
  }

  async function vote(pollId, optionId) {
    setStatus(null);
    let contract;
    try {
      const signer = walletSigner || await getSigner();
      contract = getContract(signer);
      const voterAddress = await signer.getAddress();

      let tokenConfig = {
        enabled: false,
        tokenRequired: false,
        allowGaslessVoting: false
      };
      let tokenFlagsFromPoll = {
        enabled: false,
        required: false
      };

      const currentPoll = polls.find(p => Number(p.id) === Number(pollId));

      try {
        const rawTokenConfig = await contract.getTokenConfig(pollId);
        tokenConfig = {
          enabled: rawTokenConfig?.enabled ?? rawTokenConfig?.[0] ?? false,
          tokenRequired: rawTokenConfig?.tokenRequired ?? rawTokenConfig?.[1] ?? false,
          allowGaslessVoting: rawTokenConfig?.allowGaslessVoting ?? rawTokenConfig?.[3] ?? false
        };
      } catch {
      }

      try {
        const rawPoll = await contract.polls(pollId);
        tokenFlagsFromPoll = {
          enabled: Boolean(rawPoll?.tokenVotingEnabled ?? rawPoll?.[9] ?? false),
          required: Boolean(rawPoll?.tokenVotingRequired ?? rawPoll?.[10] ?? false)
        };
      } catch {
      }

      const isTokenEnabledEffective = Boolean(
        tokenFlagsFromPoll.enabled && (tokenConfig.enabled || currentPoll?.tokenConfig?.enabled)
      );
      const isTokenRequiredEffective = Boolean(
        tokenFlagsFromPoll.required && (tokenConfig.tokenRequired || currentPoll?.tokenConfig?.tokenRequired)
      );

      setStatus('Submitting vote...');
      let tx;
      const sendTokenVoteTx = () => sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.voteInPollWithToken(pollId, optionId, voterAddress, overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying vote...')
      });

      const sendStandardVoteTx = () => sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.voteInPoll(pollId, optionId, overrides),
        onRetry: () => setStatus('Nonce conflict detected, retrying vote...')
      });

      if (isTokenRequiredEffective) {
        tx = await sendTokenVoteTx();
      } else if (isTokenEnabledEffective) {
        const canVoteWithToken = await contract.canVoteWithToken(pollId, voterAddress);
        if (canVoteWithToken) {
          tx = await sendTokenVoteTx();
        } else {
          tx = await sendStandardVoteTx();
        }
      } else {
        try {
          tx = await sendStandardVoteTx();
        } catch (standardVoteErr) {
          const details = getContractErrorDetails(standardVoteErr, contract);
          const message = details.rawMessage || '';
          const requiresTokenVoting =
            details.normalizedCode === 'TOKEN_REQUIRED' ||
            message.includes('requires token-based voting') ||
            message.includes('voteInPollWithToken');

          if (!requiresTokenVoting) {
            throw standardVoteErr;
          }

          setStatus('This poll requires token-based voting. Retrying with token vote...');
          tx = await sendTokenVoteTx();
        }
      }

      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus('Vote submitted successfully!');
      await loadPolls(addr);

      if (expandedPoll === pollId) {
        const options = await loadPollOptions(pollId);
        setPolls(polls.map(p => p.id === pollId ? { ...p, options } : p));
      }
    } catch (err) {
      const details = getContractErrorDetails(err, contract);
      const msg = details.description || err.message || String(err);
      if (msg.includes('missing revert data')) {
        setStatus('Error: Transaction reverted. The poll may not be active yet, or you may not be authorized. Try refreshing the page.');
      } else {
        setStatus(`Error: ${msg}`);
      }
    }
  }

  // ─── Secret Ballot: Commit Vote ───────────────────────────────────────────
  async function commitSecretVote(pollId, optionId) {
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const sbmContract = getSecretBallotManagerContract(signer);
      const poll = polls.find(p => Number(p.id) === Number(pollId));
      const voterAddress = await signer.getAddress();

      // Generate a random salt
      const salt = ethers.hexlify(ethers.randomBytes(32));
      // commitHash = keccak256(abi.encodePacked(pollId, optionId, salt, voterAddress))
      const commitHash = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'bytes32', 'address'],
        [pollId, optionId, salt, voterAddress]
      );

      setStatus('Committing vote (save your salt!)...');

      // Thorough token detection (same as vote())
      let isTokenEnabled = poll?.tokenConfig?.tokenRequired || poll?.tokenConfig?.enabled;
      try {
        const rawTokenConfig = await contract.getTokenConfig(pollId);
        const tcEnabled = rawTokenConfig?.enabled ?? rawTokenConfig?.[0] ?? false;
        const tcRequired = rawTokenConfig?.tokenRequired ?? rawTokenConfig?.[1] ?? false;
        if (tcEnabled || tcRequired) isTokenEnabled = true;
      } catch {}
      try {
        const rawPoll = await contract.polls(pollId);
        const pEnabled = Boolean(rawPoll?.tokenVotingEnabled ?? rawPoll?.[9] ?? false);
        const pRequired = Boolean(rawPoll?.tokenVotingRequired ?? rawPoll?.[10] ?? false);
        if (pEnabled || pRequired) isTokenEnabled = true;
      } catch {}

      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) =>
          isTokenEnabled
            ? sbmContract.commitVoteWithToken(pollId, commitHash, overrides)
            : sbmContract.commitVote(pollId, commitHash, overrides),
        onRetry: () => setStatus('Retrying commit...')
      });
      await tx.wait();

      // Persist salt and optionId so reveal can happen later (keyed by pollId+address)
      const saltKey = `${pollId}_${voterAddress}`;
      setCommitSalt(prev => ({ ...prev, [saltKey]: salt }));
      setRevealOptionId(prev => ({ ...prev, [saltKey]: optionId }));

      setStatus(`✅ Vote securely recorded for poll #${pollId}! Results will be published by the administrator.`);
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    }
  }

  // Secret ballot reveal is handled automatically by the auto-reveal useEffect.
  // No manual voter interaction is needed after voting.

  // ─── Gasless Secret Ballot: Sponsor gas from paymaster, voter commits ─────
  async function commitSecretVoteGasless(pollId, optionId) {
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const sbmContract = getSecretBallotManagerContract(signer);
      const poll = polls.find(p => Number(p.id) === Number(pollId));
      const voterAddress = await signer.getAddress();

      // Generate a random salt
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const commitHash = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'bytes32', 'address'],
        [pollId, optionId, salt, voterAddress]
      );

      // Detect token voting config
      let isTokenEnabled = poll?.tokenConfig?.tokenRequired || poll?.tokenConfig?.enabled;
      try {
        const rawTokenConfig = await contract.getTokenConfig(pollId);
        const tcEnabled = rawTokenConfig?.enabled ?? rawTokenConfig?.[0] ?? false;
        const tcRequired = rawTokenConfig?.tokenRequired ?? rawTokenConfig?.[1] ?? false;
        if (tcEnabled || tcRequired) isTokenEnabled = true;
      } catch {}
      try {
        const rawPoll = await contract.polls(pollId);
        const pEnabled = Boolean(rawPoll?.tokenVotingEnabled ?? rawPoll?.[9] ?? false);
        const pRequired = Boolean(rawPoll?.tokenVotingRequired ?? rawPoll?.[10] ?? false);
        if (pEnabled || pRequired) isTokenEnabled = true;
      } catch {}

      // Determine which commit function to call and estimate gas
      const commitFn = isTokenEnabled ? 'commitVoteWithToken' : 'commitVote';
      setStatus('Estimating gas for secret ballot commit...');

      let gasEstimate;
      try {
        gasEstimate = await sbmContract[commitFn].estimateGas(pollId, commitHash);
      } catch {
        // Fallback: use a safe default (200k gas will cover any commit)
        gasEstimate = 200000n;
      }
      // Add 30% safety margin
      const gasNeeded = gasEstimate * 130n / 100n;
      const feeData = await getEffectiveProvider().getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('2', 'gwei');
      const gasCostWei = gasNeeded * gasPrice;

      // Step 1: Sponsor gas from paymaster → voter
      setStatus('Sponsoring gas from paymaster...');

      // Get the paymaster for this poll
      const currentPoll = polls.find(p => Number(p.id) === Number(pollId));
      let paymasterAddr;
      if (currentPoll?.pollPaymaster) {
        paymasterAddr = currentPoll.pollPaymaster;
      } else {
        // Use global paymaster
        const globalPm = getVotingPaymasterContract(getEffectiveProvider());
        paymasterAddr = await globalPm.getAddress();
      }

      if (mode === 'local') {
        // In local mode, use the relayer (account #0) to forward gas to voter.
        // Withdraw from paymaster using its admin account.
        const provider = getEffectiveProvider();
        const relayerKey = HARDHAT_ACCOUNTS[0]?.key;
        const relayerSigner = relayerKey
          ? new ethers.Wallet(relayerKey, provider)
          : await provider.getSigner(0);

        const { success: sponsoredFromPaymaster } = await _withdrawFromPaymasterAsAdmin(paymasterAddr, gasCostWei, relayerSigner);

        // Send gas cost to voter (relayer pays, funded from paymaster withdrawal or relayer's own balance)
        const sendGasTx = await relayerSigner.sendTransaction({
          to: voterAddress,
          value: gasCostWei
        });
        await sendGasTx.wait();

        setStatus(sponsoredFromPaymaster
          ? `Gas sponsored from paymaster (${ethers.formatEther(gasCostWei)} ETH). Committing vote...`
          : `Gas sponsored by relayer (${ethers.formatEther(gasCostWei)} ETH). Committing vote...`
        );
      } else {
        // In production, voter pays their own gas (or a backend relayer API would sponsor)
        setStatus('Committing secret vote...');
      }

      // Step 2: Voter commits (voter is msg.sender — required by SecretBallotManager)
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => sbmContract[commitFn](pollId, commitHash, overrides),
        onRetry: () => setStatus('Retrying commit...')
      });
      await tx.wait();

      // Save salt and optionId for reveal
      const saltKey = `${pollId}_${voterAddress}`;
      setCommitSalt(prev => ({ ...prev, [saltKey]: salt }));
      setRevealOptionId(prev => ({ ...prev, [saltKey]: optionId }));

      setStatus(`✅ Gasless secret vote committed for poll #${pollId}! Gas was sponsored from the paymaster.`);
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    }
  }

  // ─── Gasless Voting (EIP-712 Meta-Transaction or relayer-sponsored) ─────
  async function voteGasless(pollId, optionId) {
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const voterAddress = await signer.getAddress();
      const contract = getContract(signer);

      // Use per-poll paymaster if set, otherwise global default
      const currentPoll = polls.find(p => Number(p.id) === Number(pollId));
      let paymasterContract;
      if (currentPoll?.pollPaymaster) {
        paymasterContract = getVotingPaymasterAt(currentPoll.pollPaymaster, getEffectiveProvider());
      } else {
        paymasterContract = getVotingPaymasterContract(getEffectiveProvider());
      }

      const paymasterAddress = await paymasterContract.getAddress();

      // Detect whether token voting is enabled for this poll
      // The paymaster's executeVoteWithToken only works when token voting is on.
      // For non-token polls, we sponsor gas to the voter and they call voteInPoll directly.
      let isTokenEnabled = Boolean(currentPoll?.tokenConfig?.enabled);
      try {
        const rawPoll = await contract.polls(pollId);
        const pEnabled = Boolean(rawPoll?.tokenVotingEnabled ?? rawPoll?.[9] ?? false);
        if (pEnabled) isTokenEnabled = true;
        if (!pEnabled) isTokenEnabled = false; // poll struct is the source of truth
      } catch {}

      if (isTokenEnabled) {
        // ── Token-enabled poll: use paymaster's executeVoteWithToken (EIP-712) ──
        const nonce = await paymasterContract.getNonce(voterAddress);
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const chainId = Number(process.env.REACT_APP_CHAIN_ID || (await getEffectiveProvider().getNetwork()).chainId);

        const domain = {
          name: 'VotingPaymaster',
          version: '1',
          chainId,
          verifyingContract: paymasterAddress,
        };

        const types = {
          VoteWithToken: [
            { name: 'pollId', type: 'uint256' },
            { name: 'optionId', type: 'uint256' },
            { name: 'voter', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        };

        const value = {
          pollId: BigInt(pollId),
          optionId: BigInt(optionId),
          voter: voterAddress,
          nonce,
          deadline: BigInt(deadline),
        };

        setStatus('Sign the gasless vote in your wallet (no gas cost)...');
        const signature = await signer.signTypedData(domain, types, value);
        const sig = ethers.Signature.from(signature);

        setStatus('Submitting gasless vote via relayer...');
        let relayerSigner;

        if (mode === 'local') {
          const provider = getEffectiveProvider();
          const ownerKey = HARDHAT_ACCOUNTS[0]?.key;
          relayerSigner = ownerKey
            ? new ethers.Wallet(ownerKey, provider)
            : await provider.getSigner(0);
        } else {
          relayerSigner = signer;
        }

        let paymasterWithRelayer;
        if (currentPoll?.pollPaymaster) {
          paymasterWithRelayer = getVotingPaymasterAt(currentPoll.pollPaymaster, relayerSigner);
        } else {
          paymasterWithRelayer = getVotingPaymasterContract(relayerSigner);
        }

        const tx = await sendTxWithNonceRetry({
          signer: relayerSigner,
          sendTx: (overrides = {}) => paymasterWithRelayer.executeVoteWithToken(
            pollId, optionId, voterAddress, deadline,
            sig.v, sig.r, sig.s, overrides
          ),
          onRetry: () => setStatus('Retrying gasless vote relay...')
        });

        setStatus('Waiting for confirmation...');
        const receipt = await tx.wait();

        // Reimburse relayer from paymaster
        if (mode === 'local' && receipt) {
          await _reimburseRelayerFromPaymaster(paymasterContract, paymasterAddress, relayerSigner, receipt);
        }

      } else {
        // ── Non-token poll: sponsor gas to voter, voter calls voteInPoll directly ──
        setStatus('Estimating gas for vote...');

        let gasEstimate;
        try {
          gasEstimate = await contract.voteInPoll.estimateGas(pollId, optionId);
        } catch {
          gasEstimate = 200000n;
        }
        const gasNeeded = gasEstimate * 130n / 100n;
        const feeData = await getEffectiveProvider().getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits('2', 'gwei');
        const gasCostWei = gasNeeded * gasPrice;

        setStatus('Sponsoring gas from paymaster...');

        if (mode === 'local') {
          const provider = getEffectiveProvider();
          const relayerKey = HARDHAT_ACCOUNTS[0]?.key;
          const relayerSigner = relayerKey
            ? new ethers.Wallet(relayerKey, provider)
            : await provider.getSigner(0);

          // Withdraw gas cost from paymaster using its admin account
          const { success: sponsoredFromPaymaster } = await _withdrawFromPaymasterAsAdmin(paymasterAddress, gasCostWei, relayerSigner);

          // Fund the voter so they can pay gas
          const sendGasTx = await relayerSigner.sendTransaction({ to: voterAddress, value: gasCostWei });
          await sendGasTx.wait();

          setStatus(sponsoredFromPaymaster
            ? `Gas sponsored from paymaster (${ethers.formatEther(gasCostWei)} ETH). Submitting vote...`
            : `Gas sponsored by relayer (${ethers.formatEther(gasCostWei)} ETH). Submitting vote...`
          );
        } else {
          setStatus('Submitting gasless vote...');
        }

        // Voter calls voteInPoll directly (now has ETH for gas)
        const tx = await sendTxWithNonceRetry({
          signer,
          sendTx: (overrides = {}) => contract.voteInPoll(pollId, optionId, overrides),
          onRetry: () => setStatus('Retrying vote...')
        });
        await tx.wait();
      }

      setStatus('✅ Gasless vote submitted successfully! Gas was sponsored from the paymaster.');
      await loadPolls(addr);
    } catch (err) {
      const details = getContractErrorDetails(err);
      setStatus(`Error: ${details.description}`);
    }
  }

  // Helper: reimburse relayer from paymaster after a gasless tx
  async function _reimburseRelayerFromPaymaster(paymasterContract, paymasterAddress, relayerSigner, receipt) {
    try {
      const gasUsed = receipt.gasUsed;
      const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice || 0n;
      const gasCostWei = gasUsed * effectiveGasPrice;

      if (gasCostWei > 0n) {
        const pmBalance = await paymasterContract.getBalance();
        if (pmBalance >= gasCostWei) {
          const { success } = await _withdrawFromPaymasterAsAdmin(paymasterAddress, gasCostWei, relayerSigner);
          if (!success) {
            console.warn('⚠️ Paymaster reimbursement failed — relayer absorbed gas cost');
          }
        } else {
          console.warn(`⚠️ Paymaster balance (${ethers.formatEther(pmBalance)} ETH) insufficient to reimburse gas (${ethers.formatEther(gasCostWei)} ETH)`);
        }
      }
    } catch (reimbErr) {
      console.warn('Gas reimbursement from paymaster failed (relayer absorbed cost):', reimbErr.message?.substring(0, 120));
    }
  }

  // ─── Delegation ───────────────────────────────────────────────────────────
  async function delegateVote(pollId) {
    setStatus(null);
    try {
      if (!delegateAddress || !ethers.isAddress(delegateAddress)) {
        setStatus('Error: Enter a valid delegate address');
        return;
      }
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Delegating vote...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.delegateVote(pollId, delegateAddress, overrides),
        onRetry: () => setStatus('Retrying delegation...')
      });
      await tx.wait();
      setStatus(`✅ Vote delegated to ${delegateAddress} for poll #${pollId}`);
      setDelegateAddress('');
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    }
  }

  async function removeDelegation(pollId) {
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      setStatus('Removing delegation...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.removeDelegation(pollId, overrides),
        onRetry: () => setStatus('Retrying remove delegation...')
      });
      await tx.wait();
      setStatus(`✅ Delegation removed for poll #${pollId}`);
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err).description}`);
    }
  }

  async function voteAsDelegate(pollId, optionId, delegatorAddress) {
    setStatus(null);
    let contract;
    try {
      const signer = walletSigner || await getSigner();
      contract = getContract(signer);
      setStatus('Voting as delegate...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.voteAsDelegate(pollId, optionId, delegatorAddress, overrides),
        onRetry: () => setStatus('Retrying delegate vote...')
      });
      await tx.wait();
      setStatus(`✅ Delegate vote cast for poll #${pollId}`);
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err, contract).description}`);
    }
  }

  // ─── Quadratic Voting ─────────────────────────────────────────────────────
  async function submitQuadraticVote(pollId) {
    setStatus(null);
    let contract;
    try {
      const signer = walletSigner || await getSigner();
      contract = getContract(signer);
      const allocations = quadraticAllocations[pollId] || {};
      const optionIds = Object.keys(allocations).filter(k => allocations[k] > 0).map(Number);
      const amounts = optionIds.map(id => Number(allocations[id]));

      if (optionIds.length === 0) {
        setStatus('Error: Allocate tokens to at least one option');
        return;
      }

      setStatus('Submitting quadratic vote...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.voteQuadratic(pollId, optionIds, amounts, overrides),
        onRetry: () => setStatus('Retrying quadratic vote...')
      });
      await tx.wait();
      setStatus(`✅ Quadratic vote submitted for poll #${pollId}`);
      setQuadraticAllocations(prev => { const n = { ...prev }; delete n[pollId]; return n; });
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err, contract).description}`);
    }
  }

  function updateQuadraticAllocation(pollId, optionId, amount) {
    setQuadraticAllocations(prev => ({
      ...prev,
      [pollId]: { ...(prev[pollId] || {}), [optionId]: Math.max(0, Number(amount) || 0) }
    }));
  }

  // ─── Multi-Choice Voting ──────────────────────────────────────────────────
  async function submitMultiChoiceVote(pollId) {
    setStatus(null);
    let contract;
    try {
      const signer = walletSigner || await getSigner();
      contract = getContract(signer);
      const selections = multiChoiceSelections[pollId] || new Set();
      const optionIds = [...selections];

      if (optionIds.length === 0) {
        setStatus('Error: Select at least one option');
        return;
      }

      setStatus('Submitting multi-choice vote...');
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (overrides = {}) => contract.voteMultiChoice(pollId, optionIds, overrides),
        onRetry: () => setStatus('Retrying multi-choice vote...')
      });
      await tx.wait();
      setStatus(`✅ Multi-choice vote submitted for poll #${pollId}`);
      setMultiChoiceSelections(prev => { const n = { ...prev }; delete n[pollId]; return n; });
      await loadPolls(addr);
    } catch (err) {
      setStatus(`Error: ${getContractErrorDetails(err, contract).description}`);
    }
  }

  function toggleMultiChoice(pollId, optionId, maxAllowed) {
    setMultiChoiceSelections(prev => {
      const current = new Set(prev[pollId] || []);
      if (current.has(optionId)) {
        current.delete(optionId);
      } else if (current.size < maxAllowed) {
        current.add(optionId);
      }
      return { ...prev, [pollId]: current };
    });
  }

  async function togglePollDetails(pollId) {
    if (expandedPoll === pollId) {
      setExpandedPoll(null);
    } else {
      const options = await loadPollOptions(pollId);
      const poll = polls.find(p => p.id === pollId);

      let winner = null;
      let tieResult = null;
      if (poll.revealed) {
        winner = await loadWinner(pollId);
        tieResult = detectTie(options);
      }

      setPolls(polls.map(p => p.id === pollId ? { ...p, options, winner, tieResult } : p));
      setExpandedPoll(pollId);
    }
  }

  useEffect(() => {
    if (addr) {
      setExpandedPoll(null);
      let pollInterval;
      const refreshMs = Number(process.env.REACT_APP_REFRESH_INTERVAL);

      const startPolling = () => {
        if (document.visibilityState !== 'visible') return;
        loadPolls(addr);
        if (refreshMs > 0) {
          pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
              loadPolls(addr);
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
      const provider = getEffectiveProvider();
      const contract = getContract(provider);
      const eventHandler = () => { loadPolls(addr); };
      const eventNames = ['Voted', 'ResultsRevealed', 'PollCreated', 'VoterAuthorized'];
      const listeners = [];
      for (const eventName of eventNames) {
        try {
          contract.on(eventName, eventHandler);
          listeners.push(eventName);
        } catch { /* event may not exist in ABI */ }
      }
      console.log('📡 Listening for live events:', listeners.join(', '));

      return () => {
        stopPolling();
        document.removeEventListener('visibilitychange', handleVisibility);
        for (const eventName of listeners) {
          try { contract.off(eventName, eventHandler); } catch {}
        }
      };
    }
  }, [addr]);

  // Live countdown ticker — re-renders every second so time labels stay accurate
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);


  const formatTimeRemaining = (endTime) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = endTime - now;

    if (remaining <= 0) return 'Voting ended';

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

  if (!addr) {
    return (
      <div className="vote-panel">
        {mode === 'local' ? (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Select Test Account</h3>
            </div>
            <p className="muted">
              Connect with a test account to see polls you can vote in.
            </p>
            <div className="account-grid">
              {HARDHAT_ACCOUNTS.map((account, index) => (
                <button
                  key={index}
                  className="btn secondary"
                  onClick={() => connectLocalAccount(index)}
                >
                  {account.name}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Connect Wallet</h3>
            </div>
            <button className="btn" onClick={connectWallet}>
              Connect MetaMask Wallet
            </button>
            <p className="muted">Connect your MetaMask wallet to see polls you are authorized to vote in.</p>
          </section>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="status-banner">Loading polls...</div>;
  }

  return (
    <div className="vote-panel">
      <section className="panel-card">
        <div className="panel-head">
          <h3>Account</h3>
          {addr && <span className="address-pill">{addr}</span>}
        </div>
        {mode === 'local' ? (
          <div>
            <div className="muted">Switch between test voters.</div>
            <div className="account-grid">
              {HARDHAT_ACCOUNTS.map((account, index) => (
                <button
                  key={index}
                  className={`btn ghost ${selectedAccount === index && walletSigner ? 'is-active' : ''}`}
                  onClick={() => connectLocalAccount(index)}
                >
                  {account.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="btn" onClick={connectWallet}>
            {addr ? 'Reconnect MetaMask' : 'Connect MetaMask'}
          </button>
        )}
      </section>

      {status && (
        <div className={`status-banner ${status.includes('Error') ? 'status-error' : 'status-success'}`}>
          {status}
        </div>
      )}

      {polls.length === 0 ? (
        <div className="empty-state">
          You are not authorized to vote in any active polls.
          <div className="muted">
            Polls may exist but you need to be authorized as a voter by the poll admin.
          </div>
          {mode === 'local' && (
            <div className="muted small">
              <strong>Steps to see polls here:</strong>
              <ol style={{ textAlign: 'left', margin: '8px auto', maxWidth: 420 }}>
                <li>Go to <Link to="/local/admin">/local/admin</Link> and connect as Account #0 (Owner)</li>
                <li>Create a poll</li>
                <li>Add this address as an authorized voter in the "Authorize Voters" section</li>
                <li>Come back here and reconnect</li>
              </ol>
            </div>
          )}
          <div className="muted small">
            Looking for ended polls? Visit the results portal at{' '}
            <Link to={mode === 'local' ? '/local/results' : '/results'}>
              {mode === 'local' ? '/local/results' : '/results'}
            </Link>.
          </div>
        </div>
      ) : (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>Your Polls ({filteredVoterPolls.length} of {polls.length})</h3>
          </div>

          <SearchBar
            searchTerm={voterSearch}
            onSearchChange={(v) => { setVoterSearch(v); setVoterPage(1); }}
            placeholder="Search polls by title or ID…"
            filters={[
              { id: 'all',      label: 'All',      active: voterStatusFilter === 'all' },
              { id: 'active',   label: 'Active',   active: voterStatusFilter === 'active' },
              { id: 'ended',    label: 'Ended',    active: voterStatusFilter === 'ended' },
              { id: 'revealed', label: 'Revealed', active: voterStatusFilter === 'revealed' },
              { id: 'voted',    label: 'Voted',    active: voterStatusFilter === 'voted' },
            ]}
            onFilterToggle={(id) => { setVoterStatusFilter(id); setVoterPage(1); }}
          />

          <div className="poll-grid">
            {voterPollsPage.map(poll => {
              const nowTs = Math.floor(Date.now() / 1000);
              const status = poll.status || { started: true, active: false, ended: poll.ended, revealed: poll.revealed };
              const hasStartedByTime = poll.startTime ? nowTs >= poll.startTime : true;
              const hasEndedByTime = poll.endTime ? nowTs >= poll.endTime : false;
              const isEndedEffective = Boolean(status.ended || hasEndedByTime);
              const isUpcoming = !isEndedEffective && !hasStartedByTime;
              const isActiveByTime = hasStartedByTime && !hasEndedByTime;
              const isActiveEffective = !isEndedEffective && (status.active || isActiveByTime);

              const statusLabel = status.revealed
                ? 'Revealed'
                : isEndedEffective
                ? 'Ended'
                : isActiveEffective
                ? 'Active'
                : isUpcoming
                ? 'Scheduled'
                : 'Inactive';

              const timeLabel = isEndedEffective
                ? 'Voting ended'
                : isUpcoming
                ? formatTimeUntil(poll.startTime)
                : formatTimeRemaining(poll.endTime);
              let statusMessage = '';

              if (isUpcoming) {
                statusMessage = '📅 Poll scheduled - voting not started yet';
              } else if (isActiveEffective) {
                statusMessage = '✅ Poll active - vote now!';
              } else if (isEndedEffective && !status.revealed) {
                statusMessage = '⏱️ Poll ended - waiting for results';
              } else if (status.revealed) {
                statusMessage = '🏆 Results available';
              }

              return (
                <div
                  key={poll.id}
                  className={`poll-card ${poll.hasVoted ? 'is-voted' : ''} ${isActiveEffective ? 'is-active' : ''}`}
                >
                  <div className="poll-card__head">
                    <div>
                      <h4 className="poll-title">
                        {poll.title}
                        {poll.hasVoted && <span className="chip chip-success" style={{ marginLeft: 8 }}>✓ Voted</span>}
                      </h4>
                      <div className="muted small">{timeLabel}</div>
                      {statusMessage && <div className="muted small">{statusMessage}</div>}
                      {poll.tokenConfig?.enabled && (poll.tokenConfig.tokenRequired || poll.voterTokenBalance > 0) && (
                        <div className="muted small">
                          {poll.tokenConfig.tokenRequired
                            ? (poll.voterTokenBalance > 0
                              ? `🔐 Token vote required (${poll.voterTokenBalance} tokens)`
                              : '🔐 Token vote required (no tokens allocated yet)')
                            : `🪙 Token voting enabled (${poll.voterTokenBalance} tokens)`}
                        </div>
                      )}
                      {poll.tokenConfig?.allowGaslessVoting && (
                        <div className="muted small">⛽ Gasless voting available (zero gas cost)</div>
                      )}
                      {poll.metadataURI && (
                        <div className="muted small" style={{ wordBreak: 'break-all' }}>
                          📎 Metadata: {(() => {
                            const resolved = resolveIpfsUri(poll.metadataURI);
                            return resolved.startsWith('http') ? (
                              <a href={resolved} target="_blank" rel="noopener noreferrer">{poll.metadataURI}</a>
                            ) : poll.metadataURI;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="poll-meta">
                    <div>
                      <span>Status</span>
                      <strong>{statusLabel}</strong>
                    </div>
                    <div>
                      <span>Ends</span>
                      <strong>{formatDateTime(poll.endTime)}</strong>
                    </div>
                    <div>
                      <span>Starts</span>
                      <strong>{formatDateTime(poll.startTime)}</strong>
                    </div>
                    {poll.revealed && (
                      <div>
                        <span>Total votes</span>
                        <strong>{poll.totalVotes}</strong>
                      </div>
                    )}
                    {poll.isSecretBallot && (
                      <div><span>Mode</span><strong><span className="chip">Secret Ballot</span></strong></div>
                    )}
                    {poll.quadraticEnabled && (
                      <div><span>Mode</span><strong><span className="chip">Quadratic</span></strong></div>
                    )}
                    {poll.maxChoices > 0 && (
                      <div><span>Multi-choice</span><strong>Up to {poll.maxChoices}</strong></div>
                    )}
                    {poll.delegation?.isDelegated && (
                      <div><span>Delegated to</span><strong className="muted small">{poll.delegation.delegatee}</strong></div>
                    )}
                    {poll.delegation?.delegationsReceived > 0 && (
                      <div><span>Delegations received</span><strong>{poll.delegation.delegationsReceived}</strong></div>
                    )}
                    {poll.isSecretBallot && poll.sbStatus && (() => {
                      const isVotingOpen = poll.sbStatus.inCommitPhase || isActiveEffective;
                      const phase = isVotingOpen ? 'Open' : isUpcoming ? 'Not Started' : 'Closed';
                      const phaseClass = isVotingOpen ? '' : isUpcoming ? '' : 'chip-success';
                      return (
                        <>
                          <div>
                            <span>Status</span>
                            <strong>
                              <span className={`chip ${phaseClass}`}>🔒 {phase}</span>
                            </strong>
                          </div>
                          <div><span>Votes cast</span><strong>{poll.sbStatus.commits}</strong></div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="poll-actions">
                    {!isUpcoming && !poll.hasVoted && isActiveEffective && (
                      <button className="btn secondary" onClick={() => togglePollDetails(poll.id)}>
                        {expandedPoll === poll.id ? 'Hide Candidates' : 'Show Candidates & Vote'}
                      </button>
                    )}
                    {(poll.hasVoted || !isActiveEffective || isUpcoming) && (
                      <button className="btn secondary" onClick={() => togglePollDetails(poll.id)}>
                        {expandedPoll === poll.id ? 'Hide Results' : poll.revealed ? 'Show Results' : 'View Candidates'}
                      </button>
                    )}
                  </div>

                  {expandedPoll === poll.id && poll.options && (
                    <div className="poll-options">
                      <h5>Candidates</h5>

                      {poll.revealed && poll.tieResult && (
                        <div className="winner-card is-tie">
                          <strong>🤝 Tie!</strong> {poll.tieResult.candidates.length} candidates tied with {poll.tieResult.votes} vote{poll.tieResult.votes !== 1 ? 's' : ''} each:
                          <div className="tie-candidates">
                            {poll.tieResult.candidates.map(c => <span key={c.id} className="chip">{c.name}</span>)}
                          </div>
                        </div>
                      )}

                      {poll.revealed && poll.winner && !poll.tieResult && (
                        <div className="winner-card">
                          <strong>🏆 Winner:</strong> {poll.winner.name} ({poll.winner.votes} votes)
                        </div>
                      )}

                      {/* ─── Secret Ballot: Vote (commit phase) ─────────────── */}
                      {poll.isSecretBallot && (poll.sbStatus?.inCommitPhase || isActiveEffective) && !poll.hasCommitted && !poll.hasVoted && isActiveEffective && (
                        <>
                          <div className="info-banner">
                            🔒 Secret Ballot — Your vote is encrypted and hidden until results are published.
                          </div>
                          {poll.options.map(option => (
                            <div key={option.id} className="option-row">
                              <div><strong>{option.name}</strong></div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button className="btn" onClick={() => commitSecretVote(poll.id, option.id)}>
                                  Vote
                                </button>
                                {poll.tokenConfig?.allowGaslessVoting && (
                                  <button className="btn secondary" onClick={() => commitSecretVoteGasless(poll.id, option.id)}>
                                    ⛽ Vote Gasless
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* ─── Secret Ballot: Already voted ── */}
                      {poll.isSecretBallot && (poll.hasCommitted || poll.hasVoted) && (
                        <div className="info-banner">
                          ✅ Your vote has been securely recorded. Results will be published by the administrator.
                          {/* Show pending reveal status and manual reveal button */}
                          {(() => {
                            let salts = {};
                            try { salts = JSON.parse(localStorage.getItem('__sb_salts') || '{}'); } catch {}
                            const pendingKeys = Object.keys(salts).filter(k => k.startsWith(`${poll.id}_`));
                            const hasPending = pendingKeys.length > 0;
                            const isEnded = poll.ended;
                            if (!hasPending) return null;
                            return (
                              <div style={{ marginTop: 8 }}>
                                <div className="muted small">
                                  {pendingKeys.length} vote(s) pending reveal.
                                  {!isEnded && ' Votes will be auto-revealed after the poll ends.'}
                                  {isEnded && ' Poll has ended — click below to reveal now.'}
                                </div>
                                {isEnded && (
                                  <button
                                    className="btn btn-sm"
                                    style={{ marginTop: 6 }}
                                    onClick={() => handleManualReveal(poll.id)}
                                  >
                                    Reveal Vote(s) Now
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* ─── Quadratic Voting ────────────────────────── */}
                      {poll.quadraticEnabled && !poll.hasVoted && isActiveEffective && !poll.isSecretBallot && (
                        <>
                          <div className="info-banner">
                            📊 Quadratic Voting — Allocate tokens to candidates. Cost = votes². Tokens: {poll.voterTokenBalance}
                          </div>
                          {poll.options.map(option => (
                            <div key={option.id} className="option-row">
                              <div>
                                <strong>{option.name}</strong>
                                {poll.revealed && <div className="muted small">Votes: {option.votes}</div>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                  type="number" min="0" style={{ width: 70 }}
                                  value={quadraticAllocations[poll.id]?.[option.id] || ''}
                                  onChange={e => updateQuadraticAllocation(poll.id, option.id, e.target.value)}
                                  className="form-input"
                                  placeholder="0"
                                />
                                <span className="muted small">
                                  cost: {Math.pow(Number(quadraticAllocations[poll.id]?.[option.id] || 0), 2)}
                                </span>
                              </div>
                            </div>
                          ))}
                          {(() => {
                            const allocs = quadraticAllocations[poll.id] || {};
                            const totalCost = Object.values(allocs).reduce((s, v) => s + (Number(v) || 0) ** 2, 0);
                            return (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span className="muted small">Total cost: {totalCost} / {poll.voterTokenBalance} tokens</span>
                                <button className="btn" onClick={() => submitQuadraticVote(poll.id)}
                                  disabled={totalCost === 0 || totalCost > poll.voterTokenBalance}>
                                  Submit Quadratic Vote
                                </button>
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {/* ─── Multi-Choice Voting ─────────────────────── */}
                      {poll.maxChoices > 0 && !poll.quadraticEnabled && !poll.isSecretBallot && !poll.hasVoted && isActiveEffective && (
                        <>
                          <div className="info-banner">
                            ☑️ Multi-Choice — Select up to {poll.maxChoices} candidates.
                          </div>
                          {poll.options.map(option => {
                            const selected = multiChoiceSelections[poll.id]?.has(option.id);
                            return (
                              <div key={option.id} className="option-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input
                                    type="checkbox" checked={!!selected}
                                    onChange={() => toggleMultiChoice(poll.id, option.id, poll.maxChoices)}
                                  />
                                  <strong>{option.name}</strong>
                                  {poll.revealed && <span className="muted small"> ({option.votes} votes)</span>}
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ marginTop: 8 }}>
                            <span className="muted small">
                              Selected: {(multiChoiceSelections[poll.id]?.size || 0)} / {poll.maxChoices}
                            </span>
                            <button className="btn" style={{ marginLeft: 12 }}
                              onClick={() => submitMultiChoiceVote(poll.id)}
                              disabled={!multiChoiceSelections[poll.id]?.size}>
                              Submit Multi-Choice Vote
                            </button>
                          </div>
                        </>
                      )}

                      {/* ─── Standard Voting (default) ───────────────── */}
                      {!poll.isSecretBallot && !poll.quadraticEnabled && !(poll.maxChoices > 0) && (
                        <>
                          {poll.options.map(option => (
                            <div key={option.id} className="option-row">
                              <div>
                                <strong>{option.name}</strong>
                                {poll.revealed && (
                                  <div className="muted small">Votes: {option.votes}</div>
                                )}
                              </div>
                              {!isUpcoming && !poll.hasVoted && isActiveEffective && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button className="btn" onClick={() => vote(poll.id, option.id)}>
                                    {poll.tokenConfig?.tokenRequired ? 'Vote with Token' : 'Vote'}
                                  </button>
                                  {poll.tokenConfig?.allowGaslessVoting && (
                                    <button className="btn secondary" onClick={() => voteGasless(poll.id, option.id)}>
                                      ⛽ Vote Gasless
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}

                      {/* ─── Delegation Controls ─────────────────────── */}
                      {isActiveEffective && !poll.hasVoted && !poll.isSecretBallot && (
                        <div style={{ marginTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
                          {poll.delegation?.isDelegated ? (
                            <div>
                              <span className="muted small">Your vote is delegated to {poll.delegation.delegatee}</span>
                              <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => removeDelegation(poll.id)}>
                                Remove Delegation
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <input
                                type="text" placeholder="Delegate address" style={{ flex: 1, minWidth: 200 }}
                                value={delegateAddress} onChange={e => setDelegateAddress(e.target.value)}
                                className="form-input"
                              />
                              <button className="btn ghost" onClick={() => delegateVote(poll.id)}>
                                Delegate Vote
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {isUpcoming && (
                        <div className="info-banner">
                          Voting has not started yet. Starts at {formatDateTime(poll.startTime)}.
                        </div>
                      )}

                      {!poll.revealed && !status.active && !isUpcoming && (
                        <div className="info-banner">
                          Results will be revealed by the poll administrator after voting ends.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination
            totalItems={filteredVoterPolls.length}
            page={voterPage}
            pageSize={voterPageSize}
            onPageChange={setVoterPage}
            onPageSizeChange={(s) => { setVoterPageSize(s); setVoterPage(1); }}
          />
        </section>
      )}
    </div>
  );
}
