import React, { useState, useEffect, useMemo } from 'react';
import { getSigner, getUpgradeableContract as getContract, getProvider, getContractErrorDetails, sendTxWithNonceRetry } from '../contract';
import { ethers } from 'ethers';
import { IS_V2, V2_FEATURES, VERSION_LABEL } from '../utils/contractVersion';
import Pagination from './Pagination';

// ─── Default Hardhat accounts (same as AdminPanel) ───────────────────────
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
  }
} catch { /* ignore */ }

export default function UpgradeableAdminPanel({ mode = 'production' }) {
  // ── Core state ──────────────────────────────────────────────────
  const [addr, setAddr] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState('');
  const [polls, setPolls] = useState([]);
  const [expandedPoll, setExpandedPoll] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Local mode
  const [walletSigner, setWalletSigner] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(0);

  // Create poll form
  const [pollTitle, setPollTitle] = useState('');
  const [pollStartTime, setPollStartTime] = useState('');
  const [pollDuration, setPollDuration] = useState('3600');

  // Add candidate
  const [selectedPollId, setSelectedPollId] = useState('');
  const [candidateName, setCandidateName] = useState('');

  // Add voters
  const [voterPollId, setVoterPollId] = useState('');
  const [voterAddresses, setVoterAddresses] = useState('');
  const [voterTokensPerVoter, setVoterTokensPerVoter] = useState('1');
  const [useTokenVoters, setUseTokenVoters] = useState(false);

  // Remove voter
  const [removeVoterPollId, setRemoveVoterPollId] = useState('');
  const [removeVoterAddress, setRemoveVoterAddress] = useState('');

  // Reveal
  const [revealPollId, setRevealPollId] = useState('');

  // Pagination
  const [dashboardPage, setDashboardPage] = useState(1);
  const [dashboardPageSize] = useState(10);

  // ── V2-only state ──────────────────────────────────────────────
  const [v2CategoryPollId, setV2CategoryPollId] = useState('');
  const [v2CategoryValue, setV2CategoryValue] = useState('');
  const [v2DescPollId, setV2DescPollId] = useState('');
  const [v2DescValue, setV2DescValue] = useState('');
  const [v2WeightPollId, setV2WeightPollId] = useState('');
  const [v2WeightVoter, setV2WeightVoter] = useState('');
  const [v2WeightValue, setV2WeightValue] = useState('2');
  const [v2PausePollId, setV2PausePollId] = useState('');
  const [v2ExtendPollId, setV2ExtendPollId] = useState('');
  const [v2ExtendSeconds, setV2ExtendSeconds] = useState('3600');
  const [v2EmergencyPollId, setV2EmergencyPollId] = useState('');
  const [v2VoterCountPollId, setV2VoterCountPollId] = useState('');
  const [v2VoterCountValue, setV2VoterCountValue] = useState('');
  const [v2PollStats, setV2PollStats] = useState({});

  // ── Helpers ─────────────────────────────────────────────────────
  const isLocal = mode === 'local';

  const connectAccount = async (index) => {
    const acct = HARDHAT_ACCOUNTS[index];
    const provider = getProvider();
    const signer = new ethers.Wallet(acct.key, provider);
    setWalletSigner(signer);
    setSelectedAccount(index);
    setAddr(acct.address);
    setStatus({ type: 'success', message: `Connected as ${acct.name}` });
  };

  const connectWallet = async () => {
    try {
      if (isLocal) {
        await connectAccount(0);
        return;
      }
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAddr(address);
      setStatus({ type: 'success', message: `Connected: ${address.slice(0, 8)}...` });
    } catch (err) {
      setStatus({ type: 'error', message: `Connection failed: ${err.message}` });
    }
  };

  // PollSelect helper
  const PollSelect = ({ value, onChange, filterFn }) => {
    const filtered = filterFn ? polls.filter(filterFn) : polls;
    return (
      <select value={value} onChange={onChange} className="form-input">
        <option value="">Select a poll...</option>
        {filtered.map(p => (
          <option key={p.id} value={p.id}>
            #{p.id} — {p.title} {p.status?.ended ? '(ended)' : p.status?.started ? '(active)' : '(upcoming)'}
          </option>
        ))}
      </select>
    );
  };

  // ── Load polls ──────────────────────────────────────────────────
  const loadPolls = async () => {
    if (!addr) return;
    setLoading(true);
    try {
      const signerOrProvider = walletSigner || getProvider();
      const contract = getContract(signerOrProvider);

      let pollsCount;
      try { pollsCount = Number(await contract.getPollsCount()); } catch {
        try { pollsCount = Number(await contract.pollsCount()); } catch { pollsCount = 0; }
      }

      const pollsData = [];
      // V1 contract bug: getPollsCount returns N but polls exist at indices 0..N
      // Index 0 is a phantom empty entry — iterate through count (inclusive) and skip blanks
      for (let i = 0; i <= pollsCount; i++) {
        try {
          const lastPoll = { id: i };

          // Title
          try { lastPoll.title = await contract.pollTitles(i); } catch {
            try { const p = await contract.polls(i); lastPoll.title = p.title || p[0] || ''; } catch { lastPoll.title = ''; }
          }
          if (!lastPoll.title) continue; // skip phantom empty poll at index 0

          // Status
          try {
            const s = await contract.getPollStatus(i);
            // V1 getPollStatus returns 4 bools: [started, active, ended, revealed]
            lastPoll.status = {
              started: s.started ?? s[0],
              ended: s.ended ?? s[2],
              revealed: s.revealed ?? s[3],
            };
          } catch { lastPoll.status = { started: false, ended: false, revealed: false }; }

          // Time
          try { lastPoll.startTime = Number(await contract.getPollStartTime(i)); } catch { lastPoll.startTime = 0; }
          try { lastPoll.endTime = Number(await contract.getPollEndTime(i)); } catch { lastPoll.endTime = 0; }

          // Options
          try {
            const count = Number(await contract.getOptionsCount(i));
            lastPoll.options = [];
            // V1 contract bug: getOptionsCount returns N but options exist at indices 0..N
            // Index 0 is a phantom empty entry from createPoll — iterate through count (inclusive) and skip blanks
            for (let j = 0; j <= count; j++) {
              try {
                const opt = await contract.getOption(i, j);
                // V1 getOption returns a plain string (the option name), not a struct
                const name = typeof opt === 'string' ? opt : (opt.name ?? opt[0]);
                if (!name) continue; // skip phantom empty option at index 0
                // V1 stores votes separately — fetch via getVotes(pollId, optionId)
                // V1 getVotes() reverts with PollNotRevealed if poll isn't revealed yet
                let votes = 0;
                if (lastPoll.status.revealed) {
                  if (typeof opt === 'string') {
                    try { votes = Number(await contract.getVotes(i, j)); } catch { votes = 0; }
                  } else {
                    votes = Number(opt.votes ?? opt[1] ?? 0);
                  }
                }
                lastPoll.options.push({ id: j, name, votes });
              } catch { /* skip — index may not exist */ }
            }
            lastPoll.optionsCount = lastPoll.options.length;
          } catch { lastPoll.optionsCount = 0; lastPoll.options = []; }

          // Total votes
          try { lastPoll.totalVotes = Number(await contract.getTotalVotes(i)); } catch { lastPoll.totalVotes = 0; }

          // Winner (if revealed)
          if (lastPoll.status.revealed) {
            try {
              const w = await contract.getWinner(i);
              // V1 getWinner returns (uint256 winnerId, string winnerName) — NOT (name, votes)
              if (typeof w === 'string') {
                lastPoll.winner = { name: w, votes: lastPoll.totalVotes || 0 };
              } else {
                const winnerName = w.winnerName ?? w.name ?? (typeof w[1] === 'string' ? w[1] : String(w[0]));
                let winnerVotes;
                if (w.votes !== undefined) {
                  winnerVotes = Number(w.votes);
                } else {
                  const winnerId = w.winnerId ?? w[0];
                  const matchedOpt = lastPoll.options && lastPoll.options.find(o => o.id === Number(winnerId));
                  winnerVotes = matchedOpt ? matchedOpt.votes : (lastPoll.totalVotes || 0);
                }
                lastPoll.winner = { name: winnerName, votes: winnerVotes };
              }
            } catch { lastPoll.winner = null; }
          }

          // Token info
          try { lastPoll.canVoteWithToken = addr ? await contract.canVoteWithToken(i, addr) : false; } catch { lastPoll.canVoteWithToken = false; }

          // V2-exclusive data
          if (IS_V2) {
            const v2Data = {};
            try { v2Data.isPaused = await contract.pollPaused(i); } catch { v2Data.isPaused = false; }
            try { v2Data.category = await contract.pollCategories(i); } catch { v2Data.category = ''; }
            try { v2Data.description = await contract.getPollDescription(i); } catch { v2Data.description = ''; }
            try { v2Data.emergencyEnded = await contract.emergencyEnded(i); } catch { v2Data.emergencyEnded = false; }
            try {
              const stats = await contract.getPollStats(i);
              v2Data.participationRate = Number(stats.participationRate ?? stats[1] ?? 0);
              v2Data.diversity = Number(stats.diversity ?? stats[2] ?? 0);
            } catch { v2Data.participationRate = 0; v2Data.diversity = 0; }
            lastPoll.v2 = v2Data;
          }

          pollsData.push(lastPoll);

          // Augment status with wall-clock checks (Hardhat block timestamp lags)
          const now = Math.floor(Date.now() / 1000);
          if (lastPoll.startTime && lastPoll.startTime <= now && !lastPoll.status.started) {
            lastPoll.status.started = true;
          }
          if (lastPoll.endTime && lastPoll.endTime <= now && !lastPoll.status.ended) {
            lastPoll.status.ended = true;
          }
        } catch (pollErr) {
          console.warn(`Failed to load poll #${i}:`, pollErr.message);
        }
      }

      setPolls(pollsData);
    } catch (err) {
      setStatus({ type: 'error', message: `Error loading polls: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // ── Check ownership ─────────────────────────────────────────────
  useEffect(() => {
    if (!addr) return;
    (async () => {
      try {
        const contract = getContract(walletSigner || getProvider());
        const owner = await contract.owner();
        setOwnerAddress(owner);
        setIsOwner(addr.toLowerCase() === owner.toLowerCase());
      } catch { setIsOwner(false); }
      loadPolls();
    })();
    // eslint-disable-next-line
  }, [addr]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleCreatePoll = async (e) => {
    e.preventDefault();
    if (!pollTitle.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const admin = await signer.getAddress();
      // Default: start in 5 minutes so admin has time to add candidates/voters before the poll starts
      const start = pollStartTime ? Math.floor(new Date(pollStartTime).getTime() / 1000) : Math.floor(Date.now() / 1000) + 300;
      const dur = parseInt(pollDuration) || 3600;
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (opts) => contract.createPoll(
          pollTitle.trim(),      // title
          admin,                 // poll admin
          start,                 // startTime
          dur,                   // durationSeconds
          false,                 // enableTokenVoting
          false,                 // requireTokenVoting
          ethers.ZeroAddress,    // customTokenManager (unused)
          ethers.ZeroAddress,    // customVotingPaymaster (unused)
          opts || {},
        ),
      });
      const receipt = await tx.wait();
      const newId = polls.length;
      setStatus({ type: 'success', message: `Poll "${pollTitle.trim()}" created (likely #${newId}) — tx: ${receipt.hash.slice(0, 12)}...` });
      setPollTitle('');
      setPollStartTime('');
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Create poll failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const handleAddCandidate = async (e) => {
    e.preventDefault();
    if (!selectedPollId || !candidateName.trim()) return;
    setLoading(true);
    setStatus(null);

    // Pre-check: poll must not have started yet
    const poll = polls.find(p => p.id === Number(selectedPollId));
    if (poll?.status?.started) {
      setStatus({ type: 'error', message: `Poll #${selectedPollId} has already started — candidates can only be added before the start time.` });
      setLoading(false);
      return;
    }

    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.addOptionToPoll(selectedPollId, candidateName.trim(), opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `"${candidateName.trim()}" added to Poll #${selectedPollId}` });
      setCandidateName('');
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Add candidate failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const handleAddVoters = async (e) => {
    e.preventDefault();
    if (!voterPollId || !voterAddresses.trim()) return;
    setLoading(true);
    setStatus(null);

    // Pre-check: poll must not have started yet
    const poll = polls.find(p => p.id === Number(voterPollId));
    if (poll?.status?.started) {
      setStatus({ type: 'error', message: `Poll #${voterPollId} has already started — voters can only be added before the start time.` });
      setLoading(false);
      return;
    }

    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const addresses = voterAddresses.split(/[\n,]+/).map(a => a.trim()).filter(a => ethers.isAddress(a));
      if (addresses.length === 0) { setStatus({ type: 'error', message: 'No valid addresses found.' }); return; }

      let tx;
      if (useTokenVoters) {
        const tokens = parseInt(voterTokensPerVoter) || 1;
        tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.addVotersWithTokens(voterPollId, addresses, tokens, opts || {}) });
      } else if (addresses.length === 1) {
        tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.addVoter(voterPollId, addresses[0], opts || {}) });
      } else {
        tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.addVoters(voterPollId, addresses, opts || {}) });
      }
      await tx.wait();
      setStatus({ type: 'success', message: `${addresses.length} voter(s) added to Poll #${voterPollId}${useTokenVoters ? ` with ${voterTokensPerVoter} token(s) each` : ''}` });
      setVoterAddresses('');
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Add voters failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const handleRemoveVoter = async (e) => {
    e.preventDefault();
    if (!removeVoterPollId || !removeVoterAddress.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.removeVoter(removeVoterPollId, removeVoterAddress.trim(), opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Voter ${removeVoterAddress.trim().slice(0,8)}... removed from Poll #${removeVoterPollId}` });
      setRemoveVoterAddress('');
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Remove voter failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const handleReveal = async (e) => {
    e.preventDefault();
    if (!revealPollId) return;
    setLoading(true);
    setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.revealResults(revealPollId, opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Results revealed for Poll #${revealPollId}` });
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Reveal failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  // ── V2 Handlers ─────────────────────────────────────────────────
  const v2SetPollCategory = async (e) => {
    e.preventDefault();
    if (!v2CategoryPollId || !v2CategoryValue.trim()) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.setPollCategory(v2CategoryPollId, v2CategoryValue.trim(), opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Category set to "${v2CategoryValue.trim()}" for Poll #${v2CategoryPollId}` });
      setV2CategoryValue('');
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Set category failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2SetPollDescription = async (e) => {
    e.preventDefault();
    if (!v2DescPollId || !v2DescValue.trim()) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.setPollDescription(v2DescPollId, v2DescValue.trim(), opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Description set for Poll #${v2DescPollId}` });
      setV2DescValue('');
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Set description failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2SetVoteWeight = async (e) => {
    e.preventDefault();
    if (!v2WeightPollId || !v2WeightVoter || !v2WeightValue) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.setVoteWeight(v2WeightPollId, v2WeightVoter, Number(v2WeightValue), opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Vote weight set to ${v2WeightValue}x for voter ${v2WeightVoter.slice(0,8)}... in Poll #${v2WeightPollId}` });
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Set vote weight failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2TogglePause = async (e) => {
    e.preventDefault();
    if (!v2PausePollId) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const isPaused = await contract.pollPaused(v2PausePollId);
      const tx = await sendTxWithNonceRetry({
        signer,
        sendTx: (opts) => isPaused
          ? contract.unpausePoll(v2PausePollId, opts || {})
          : contract.pausePoll(v2PausePollId, opts || {}),
      });
      await tx.wait();
      setStatus({ type: 'success', message: `Poll #${v2PausePollId} ${isPaused ? 'unpaused' : 'paused'}` });
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Pause/unpause failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2ExtendDeadline = async (e) => {
    e.preventDefault();
    if (!v2ExtendPollId || !v2ExtendSeconds) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.extendPollDeadline(v2ExtendPollId, Number(v2ExtendSeconds), opts || {}) });
      await tx.wait();
      const hours = Math.floor(Number(v2ExtendSeconds) / 3600);
      const mins = Math.floor((Number(v2ExtendSeconds) % 3600) / 60);
      setStatus({ type: 'success', message: `Poll #${v2ExtendPollId} deadline extended by ${hours > 0 ? hours + 'h ' : ''}${mins}m` });
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Extend deadline failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2EmergencyEnd = async (e) => {
    e.preventDefault();
    if (!v2EmergencyPollId) return;
    if (!window.confirm(`⚠️ Emergency end Poll #${v2EmergencyPollId}? This cannot be undone.`)) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.emergencyEndPoll(v2EmergencyPollId, opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Poll #${v2EmergencyPollId} emergency ended` });
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Emergency end failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2SetVoterCount = async (e) => {
    e.preventDefault();
    if (!v2VoterCountPollId || !v2VoterCountValue) return;
    setLoading(true); setStatus(null);
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.setAuthorizedVoterCount(v2VoterCountPollId, Number(v2VoterCountValue), opts || {}) });
      await tx.wait();
      setStatus({ type: 'success', message: `Voter count set to ${v2VoterCountValue} for Poll #${v2VoterCountPollId}` });
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus({ type: 'error', message: `Set voter count failed: ${details.description}` });
    } finally { setLoading(false); }
  };

  const v2LoadPollStats = async (pollId) => {
    try {
      const contract = getContract(walletSigner || getProvider());
      const stats = await contract.getPollStats(pollId);
      setV2PollStats(prev => ({
        ...prev,
        [pollId]: {
          totalVotes: Number(stats.totalVotes),
          participationRate: Number(stats.participationRate),
          diversity: Number(stats.diversity),
          isPaused: stats.isPaused,
        },
      }));
    } catch (err) {
      console.warn(`Failed to load V2 stats for poll ${pollId}:`, err.message);
    }
  };

  // ── Format helpers ──────────────────────────────────────────────
  const formatTimeRemaining = (endTime) => {
    if (!endTime) return '';
    const remaining = endTime - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return 'Ended';
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  // Paginated polls
  const dashboardPollsPage = useMemo(() => {
    const start = (dashboardPage - 1) * dashboardPageSize;
    return polls.slice(start, start + dashboardPageSize);
  }, [polls, dashboardPage, dashboardPageSize]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="admin-panel">
      {/* Account selector (local mode) */}
      {isLocal && (
        <div className="account-selector" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {HARDHAT_ACCOUNTS.map((acct, i) => (
              <button
                key={i}
                onClick={() => connectAccount(i)}
                className={`btn ${selectedAccount === i && addr ? 'primary' : 'ghost'}`}
                style={{ fontSize: 12 }}
              >
                {acct.name}
              </button>
            ))}
          </div>
          {addr && <div className="muted small" style={{ marginTop: 4 }}>Connected: {addr}</div>}
        </div>
      )}

      {/* MetaMask connect (production) */}
      {!isLocal && !addr && (
        <button onClick={connectWallet} className="btn primary">
          Connect MetaMask
        </button>
      )}

      {/* Status banner */}
      {status && (
        <div className={`status-banner ${status.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {status.type === 'error' ? '❌' : '✅'} {status.message}
        </div>
      )}

      {addr && (
        <>
          {/* Contract info header */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <span className="chip" style={{ background: IS_V2 ? '#2e7d32' : '#ed6c02', color: 'white' }}>
              {VERSION_LABEL} Upgradeable
            </span>
            {isOwner && <span className="chip chip-success">Owner</span>}
            <span className="muted small">Contract: {getContract(getProvider()).target?.slice(0, 12)}...</span>
            <span className="muted small">{polls.length} poll(s)</span>
            <button onClick={loadPolls} className="btn ghost" style={{ fontSize: 12, marginLeft: 'auto' }}>
              🔄 Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="tab-bar" style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {['dashboard', 'create', 'participants', 'reveal', ...(IS_V2 ? ['v2-features'] : [])].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`btn ${activeTab === tab ? 'primary' : 'ghost'}`}
                style={{ fontSize: 13 }}
              >
                {tab === 'dashboard' ? '📊 Dashboard' : tab === 'create' ? '➕ Create' : tab === 'participants' ? '👥 Participants' : tab === 'reveal' ? '🏆 Reveal' : '⚡ V2 Features'}
              </button>
            ))}
          </div>

          {/* ═══ DASHBOARD TAB ═══ */}
          {activeTab === 'dashboard' && (
            <div>
              <h3>Poll Dashboard</h3>
              {loading && <div className="muted">Loading polls...</div>}
              {polls.length === 0 && !loading && (
                <div className="muted" style={{ padding: '1rem' }}>No polls found. Create one first!</div>
              )}
              {polls.length > 0 && (
                <>
                  <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Options</th>
                        <th>Votes</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardPollsPage.map(poll => (
                        <React.Fragment key={poll.id}>
                          <tr
                            onClick={() => setExpandedPoll(expandedPoll === poll.id ? null : poll.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>{poll.id}</td>
                            <td>
                              <strong>{poll.title}</strong>
                              {IS_V2 && poll.v2?.category && <span className="chip" style={{ fontSize: 10, marginLeft: 4 }}>📁 {poll.v2.category}</span>}
                            </td>
                            <td>
                              {poll.status?.revealed ? '🏆 Revealed' :
                               poll.status?.ended ? '⏱️ Ended' :
                               poll.status?.started ? '✅ Active' : '📅 Upcoming'}
                              {IS_V2 && poll.v2?.isPaused && <span style={{ color: '#d32f2f', marginLeft: 4 }}>⏸️</span>}
                              {IS_V2 && poll.v2?.emergencyEnded && <span style={{ color: '#d32f2f', marginLeft: 4 }}>🚨</span>}
                            </td>
                            <td>{poll.optionsCount || 0}</td>
                            <td>{poll.totalVotes}</td>
                            <td>{formatTimeRemaining(poll.endTime)}</td>
                          </tr>
                          {expandedPoll === poll.id && (
                            <tr>
                              <td colSpan="6" style={{ padding: '0.75rem', background: 'var(--bg-raised, #f5f5f5)' }}>
                                <div style={{ display: 'grid', gap: 4 }}>
                                  {poll.options.map(opt => (
                                    <div key={opt.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>{opt.name}</span>
                                      <strong>{opt.votes} vote(s)</strong>
                                    </div>
                                  ))}
                                  {poll.options.length === 0 && <div className="muted">No candidates added yet.</div>}
                                  {poll.winner && <div style={{ marginTop: 8 }}><strong>🏆 Winner: {poll.winner.name}</strong> ({poll.winner.votes} votes)</div>}
                                  {poll.canVoteWithToken && <span className="chip" style={{ marginTop: 4 }}>🪙 Token Voting</span>}
                                  {IS_V2 && poll.v2?.description && <div className="muted small" style={{ marginTop: 4 }}>📝 {poll.v2.description}</div>}
                                  {IS_V2 && poll.v2 && (poll.v2.participationRate > 0) && (
                                    <div className="muted small">
                                      📊 Participation: {poll.v2.participationRate}%
                                      {poll.v2.diversity > 0 ? ` | Diversity: ${poll.v2.diversity}%` : ''}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                  <Pagination
                    page={dashboardPage}
                    totalItems={polls.length}
                    pageSize={dashboardPageSize}
                    onPageChange={setDashboardPage}
                  />
                </>
              )}
            </div>
          )}

          {/* ═══ CREATE TAB ═══ */}
          {activeTab === 'create' && (
            <div>
              <section className="panel-card">
                <div className="panel-head"><h3>Create Poll</h3></div>
                <form onSubmit={handleCreatePoll} className="form-stack">
                  <input type="text" placeholder="Poll title" value={pollTitle} onChange={e => setPollTitle(e.target.value)} className="form-input" required />
                  <label className="form-label">Start time (optional — defaults to 5 min from now)</label>
                  <input type="datetime-local" value={pollStartTime} onChange={e => setPollStartTime(e.target.value)} className="form-input" />
                  <div className="muted small">⏱ Add candidates &amp; voters before the start time — they cannot be added after the poll starts.</div>
                  <label className="form-label">Duration (seconds)</label>
                  <input type="number" min="60" value={pollDuration} onChange={e => setPollDuration(e.target.value)} className="form-input" />
                  <div className="muted small">= {Math.floor((parseInt(pollDuration) || 0) / 3600)}h {Math.floor(((parseInt(pollDuration) || 0) % 3600) / 60)}m</div>
                  <button type="submit" className="btn primary" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Poll'}
                  </button>
                </form>
              </section>

              <section className="panel-card">
                <div className="panel-head"><h3>Add Candidate</h3></div>
                <form onSubmit={handleAddCandidate} className="form-stack">
                  <PollSelect value={selectedPollId} onChange={e => setSelectedPollId(e.target.value)} filterFn={p => !p.status?.started} />
                  <input type="text" placeholder="Candidate name" value={candidateName} onChange={e => setCandidateName(e.target.value)} className="form-input" required />
                  <button type="submit" className="btn secondary" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Candidate'}
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* ═══ PARTICIPANTS TAB ═══ */}
          {activeTab === 'participants' && (
            <div>
              <section className="panel-card">
                <div className="panel-head"><h3>Add Voters</h3></div>
                <form onSubmit={handleAddVoters} className="form-stack">
                  <PollSelect value={voterPollId} onChange={e => setVoterPollId(e.target.value)} />
                  <textarea
                    placeholder="Voter addresses (one per line or comma-separated)"
                    value={voterAddresses} onChange={e => setVoterAddresses(e.target.value)}
                    className="form-input" rows={4}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={useTokenVoters} onChange={e => setUseTokenVoters(e.target.checked)} />
                    Add with tokens
                  </label>
                  {useTokenVoters && (
                    <input type="number" min="1" placeholder="Tokens per voter" value={voterTokensPerVoter} onChange={e => setVoterTokensPerVoter(e.target.value)} className="form-input" />
                  )}
                  {isLocal && (
                    <button type="button" className="btn ghost" style={{ fontSize: 12 }}
                      onClick={() => setVoterAddresses(HARDHAT_ACCOUNTS.slice(1, 5).map(a => a.address).join('\n'))}>
                      📋 Paste test voter addresses
                    </button>
                  )}
                  <button type="submit" className="btn primary" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Voters'}
                  </button>
                </form>
              </section>

              <section className="panel-card">
                <div className="panel-head"><h3>Remove Voter</h3></div>
                <form onSubmit={handleRemoveVoter} className="form-stack">
                  <PollSelect value={removeVoterPollId} onChange={e => setRemoveVoterPollId(e.target.value)} />
                  <input type="text" placeholder="Voter address (0x...)" value={removeVoterAddress} onChange={e => setRemoveVoterAddress(e.target.value)} className="form-input" />
                  <button type="submit" className="btn secondary" disabled={loading}>
                    {loading ? 'Removing...' : 'Remove Voter'}
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* ═══ REVEAL TAB ═══ */}
          {activeTab === 'reveal' && (
            <div>
              <section className="panel-card">
                <div className="panel-head"><h3>Reveal Results</h3></div>
                <form onSubmit={handleReveal} className="form-stack">
                  <PollSelect value={revealPollId} onChange={e => setRevealPollId(e.target.value)} filterFn={p => p.status?.ended && !p.status?.revealed} />
                  <button type="submit" className="btn primary" disabled={loading}>
                    {loading ? 'Revealing...' : '🏆 Reveal Results'}
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* ═══ V2 FEATURES TAB ═══ */}
          {IS_V2 && activeTab === 'v2-features' && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <span className="chip" style={{ background: '#2e7d32', color: 'white' }}>V2 Exclusive Features</span>
              </div>

              {/* Poll Categories */}
              {V2_FEATURES.categories && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>📁 Poll Category <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <form onSubmit={v2SetPollCategory} className="form-stack">
                    <PollSelect value={v2CategoryPollId} onChange={e => setV2CategoryPollId(e.target.value)} />
                    <input type="text" placeholder="Category (e.g. governance, community, HR)" value={v2CategoryValue} onChange={e => setV2CategoryValue(e.target.value)} className="form-input" />
                    <button type="submit" className="btn secondary" disabled={loading}>{loading ? 'Setting...' : 'Set Category'}</button>
                  </form>
                </section>
              )}

              {/* Poll Descriptions */}
              {V2_FEATURES.pollDescriptions && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>📝 Poll Description <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <form onSubmit={v2SetPollDescription} className="form-stack">
                    <PollSelect value={v2DescPollId} onChange={e => setV2DescPollId(e.target.value)} />
                    <textarea placeholder="On-chain description for this poll" value={v2DescValue} onChange={e => setV2DescValue(e.target.value)} className="form-input" rows={3} style={{ resize: 'vertical' }} />
                    <button type="submit" className="btn secondary" disabled={loading}>{loading ? 'Setting...' : 'Set Description'}</button>
                  </form>
                </section>
              )}

              {/* Vote Weights */}
              {V2_FEATURES.voteWeights && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>⚖️ Vote Weight <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <div className="muted small" style={{ marginBottom: 8 }}>
                    Set a vote multiplier (1–10) for a voter. Must be set before the poll starts. Default weight is 1.
                  </div>
                  <form onSubmit={v2SetVoteWeight} className="form-stack">
                    <PollSelect value={v2WeightPollId} onChange={e => setV2WeightPollId(e.target.value)} filterFn={p => !p.status?.started} />
                    <input type="text" placeholder="Voter address (0x...)" value={v2WeightVoter} onChange={e => setV2WeightVoter(e.target.value)} className="form-input" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min="1" max="10" value={v2WeightValue} onChange={e => setV2WeightValue(e.target.value)} style={{ flex: 1 }} />
                      <span style={{ fontWeight: 'bold', minWidth: 30, textAlign: 'center' }}>{v2WeightValue}x</span>
                    </div>
                    <button type="submit" className="btn secondary" disabled={loading}>{loading ? 'Setting...' : 'Set Vote Weight'}</button>
                  </form>
                </section>
              )}

              {/* Poll Pause */}
              {V2_FEATURES.pollPause && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>⏸️ Pause / Unpause Poll <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <div className="muted small" style={{ marginBottom: 8 }}>
                    Pausing a poll prevents new votes while keeping the deadline running. Unpause to resume.
                  </div>
                  <form onSubmit={v2TogglePause} className="form-stack">
                    <PollSelect value={v2PausePollId} onChange={e => setV2PausePollId(e.target.value)} filterFn={p => !p.status?.ended} />
                    <button type="submit" className="btn secondary" disabled={loading}>{loading ? 'Processing...' : 'Toggle Pause'}</button>
                  </form>
                </section>
              )}

              {/* Extend Deadline */}
              {V2_FEATURES.deadlineExtension && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>⏰ Extend Deadline <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <div className="muted small" style={{ marginBottom: 8 }}>
                    Extend active or upcoming poll deadline. Max extension: 30 days.
                  </div>
                  <form onSubmit={v2ExtendDeadline} className="form-stack">
                    <PollSelect value={v2ExtendPollId} onChange={e => setV2ExtendPollId(e.target.value)} filterFn={p => !p.status?.revealed} />
                    <label className="form-label">Additional time (seconds)</label>
                    <input type="number" min="1" max="2592000" placeholder="3600 (1 hour)" value={v2ExtendSeconds} onChange={e => setV2ExtendSeconds(e.target.value)} className="form-input" />
                    <div className="muted small">
                      = {Math.floor(Number(v2ExtendSeconds || 0) / 3600)}h {Math.floor((Number(v2ExtendSeconds || 0) % 3600) / 60)}m
                    </div>
                    <button type="submit" className="btn secondary" disabled={loading}>{loading ? 'Extending...' : 'Extend Deadline'}</button>
                  </form>
                </section>
              )}

              {/* Emergency End */}
              {V2_FEATURES.emergencyEnd && (
                <section className="panel-card" style={{ borderLeft: '3px solid #d32f2f' }}>
                  <div className="panel-head">
                    <h3>🚨 Emergency End Poll <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <div className="muted small" style={{ marginBottom: 8, color: '#d32f2f' }}>
                    ⚠️ Immediately end a poll. This is irreversible — no more votes will be accepted.
                  </div>
                  <form onSubmit={v2EmergencyEnd} className="form-stack">
                    <PollSelect value={v2EmergencyPollId} onChange={e => setV2EmergencyPollId(e.target.value)} filterFn={p => !p.status?.ended && !p.status?.revealed} />
                    <button type="submit" className="btn" disabled={loading} style={{ background: '#d32f2f', color: 'white' }}>
                      {loading ? 'Ending...' : '🚨 Emergency End Poll'}
                    </button>
                  </form>
                </section>
              )}

              {/* Voter Count Tracking */}
              {V2_FEATURES.voterCountTracking && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>📊 Voter Count (Participation) <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <div className="muted small" style={{ marginBottom: 8 }}>
                    Set the total authorized voter count to enable participation rate calculation.
                  </div>
                  <form onSubmit={v2SetVoterCount} className="form-stack">
                    <PollSelect value={v2VoterCountPollId} onChange={e => setV2VoterCountPollId(e.target.value)} />
                    <input type="number" min="1" placeholder="Total authorized voters" value={v2VoterCountValue} onChange={e => setV2VoterCountValue(e.target.value)} className="form-input" />
                    <button type="submit" className="btn secondary" disabled={loading}>{loading ? 'Setting...' : 'Set Voter Count'}</button>
                  </form>
                </section>
              )}

              {/* V2 Poll Stats */}
              {V2_FEATURES.pollStats && (
                <section className="panel-card">
                  <div className="panel-head">
                    <h3>📈 Poll Stats <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 6 }}>V2</span></h3>
                  </div>
                  <div className="form-stack">
                    <PollSelect value="" onChange={e => { if (e.target.value) v2LoadPollStats(e.target.value); }} />
                    {Object.entries(v2PollStats).map(([pollId, stats]) => (
                      <div key={pollId} style={{ padding: 8, background: 'var(--bg-raised, #f5f5f5)', borderRadius: 6, marginTop: 4 }}>
                        <strong>Poll #{pollId}</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
                          <span>Total Votes: <strong>{stats.totalVotes}</strong></span>
                          <span>Participation: <strong>{stats.participationRate}%</strong></span>
                          <span>Diversity: <strong>{stats.diversity}%</strong></span>
                          <span>Paused: <strong>{stats.isPaused ? '⏸️ Yes' : '▶️ No'}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
