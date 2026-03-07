import React, { useState, useEffect, useMemo } from 'react';
import { getSigner, getUpgradeableContract as getContract, getProvider, getContractErrorDetails, sendTxWithNonceRetry } from '../contract';
import { ethers } from 'ethers';
import { IS_V2, VERSION_LABEL } from '../utils/contractVersion';
import Pagination from './Pagination';

// ─── Default Hardhat accounts ─────────────────────────────────
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
  if (envAccounts) HARDHAT_ACCOUNTS = JSON.parse(envAccounts);
} catch { /* ignore */ }

export default function UpgradeableVoteList({ mode = 'production' }) {
  const [addr, setAddr] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [polls, setPolls] = useState([]);
  const [expandedPoll, setExpandedPoll] = useState(null);
  const [votingOption, setVotingOption] = useState(null);
  const [walletSigner, setWalletSigner] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const isLocal = mode === 'local';

  const connectAccount = async (index) => {
    const acct = HARDHAT_ACCOUNTS[index];
    const provider = getProvider();
    const signer = new ethers.Wallet(acct.key, provider);
    setWalletSigner(signer);
    setSelectedAccount(index);
    setAddr(acct.address);
    setStatus(`Connected as ${acct.name}`);
  };

  const connectWallet = async () => {
    try {
      if (isLocal) { await connectAccount(1); return; }
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAddr(address);
      setStatus(`Connected: ${address.slice(0, 8)}...`);
    } catch (err) {
      setStatus(`Connection failed: ${err.message}`);
    }
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

          // Authorization check
          try {
            const authorized = await contract.isVoterAuthorized(i, addr);
            if (!authorized) continue; // Skip polls this voter isn't authorized for
          } catch { continue; }

          // Title
          try { lastPoll.title = await contract.pollTitles(i); } catch {
            try { const p = await contract.polls(i); lastPoll.title = p.title || p[0] || ''; } catch { lastPoll.title = ''; }
          }
          if (!lastPoll.title) continue; // skip phantom empty poll at index 0

          // Status
          try {
            const s = await contract.getPollStatus(i);
            // V1 getPollStatus returns 4 bools: [started, active, ended, revealed]
            lastPoll.status = { started: s.started ?? s[0], ended: s.ended ?? s[2], revealed: s.revealed ?? s[3] };
          } catch { lastPoll.status = { started: false, ended: false, revealed: false }; }

          // Time
          try { lastPoll.startTime = Number(await contract.getPollStartTime(i)); } catch { lastPoll.startTime = 0; }
          try { lastPoll.endTime = Number(await contract.getPollEndTime(i)); } catch { lastPoll.endTime = 0; }

          // Has voted
          try { lastPoll.hasVoted = await contract.hasVoterVoted(i, addr); } catch { lastPoll.hasVoted = false; }

          // Voter choice (if voted)
          if (lastPoll.hasVoted) {
            try { lastPoll.voterChoice = Number(await contract.getVoterChoice(i, addr)); } catch { lastPoll.voterChoice = -1; }
          }

          // Options
          try {
            const count = Number(await contract.getOptionsCount(i));
            lastPoll.options = [];
            // V1 contract bug: getOptionsCount returns N but options exist at indices 0..N
            // Index 0 is a phantom empty entry from createPoll — iterate through count (inclusive) and skip blanks
            for (let j = 0; j <= count; j++) {
              try {
                const opt = await contract.getOption(i, j);
                const name = typeof opt === 'string' ? opt : (opt.name ?? opt[0]);
                if (!name) continue; // skip phantom empty option at index 0
                let votes = 0;
                // V1 getVotes() reverts with PollNotRevealed if poll isn't revealed yet
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
          } catch { lastPoll.options = []; }

          // Total votes
          try { lastPoll.totalVotes = Number(await contract.getTotalVotes(i)); } catch { lastPoll.totalVotes = 0; }

          // Token
          try { lastPoll.canVoteWithToken = addr ? await contract.canVoteWithToken(i, addr) : false; } catch { lastPoll.canVoteWithToken = false; }
          if (lastPoll.canVoteWithToken) {
            try { lastPoll.voterTokenBalance = Number(await contract.getVoterTokenBalance(i, addr)); } catch { lastPoll.voterTokenBalance = 0; }
          }

          // Winner
          if (lastPoll.status.revealed) {
            try {
              const w = await contract.getWinner(i);
              // V1 getWinner may return a plain string or a struct
              if (typeof w === 'string') {
                lastPoll.winner = { name: w, votes: lastPoll.totalVotes || 0 };
              } else {
                lastPoll.winner = { name: w.name ?? w[0], votes: Number(w.votes ?? w[1]) };
              }
            } catch { lastPoll.winner = null; }
          }

          // V2-exclusive data
          if (IS_V2) {
            const v2Data = {};
            try { v2Data.isPaused = await contract.pollPaused(i); } catch { v2Data.isPaused = false; }
            try { v2Data.category = await contract.pollCategories(i); } catch { v2Data.category = ''; }
            try { v2Data.description = await contract.getPollDescription(i); } catch { v2Data.description = ''; }
            try { v2Data.emergencyEnded = await contract.emergencyEnded(i); } catch { v2Data.emergencyEnded = false; }
            try {
              const w = Number(await contract.getVoteWeight(i, addr));
              v2Data.voteWeight = w || 1;
            } catch { v2Data.voteWeight = 1; }
            lastPoll.v2 = v2Data;
          }

          pollsData.push(lastPoll);
        } catch (pollErr) {
          console.warn(`Failed to load poll #${i}:`, pollErr.message);
        }
      }

      setPolls(pollsData);
    } catch (err) {
      setStatus(`Error loading polls: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (addr) loadPolls();
    // eslint-disable-next-line
  }, [addr]);

  // ── Vote handler ────────────────────────────────────────────────
  const handleVote = async (pollId, optionId) => {
    setLoading(true);
    setStatus('');
    try {
      const signer = walletSigner || await getSigner();
      const contract = getContract(signer);
      const voterAddr = await signer.getAddress();

      // ── Pre-flight eligibility checks (Hardhat v3 + proxy masks revert data) ──
      try {
        const [active, started, ended, voted, authorized] = await Promise.all([
          contract.isPollActive(pollId).catch(() => null),
          contract.isPollStarted(pollId).catch(() => null),
          contract.isPollEnded(pollId).catch(() => null),
          contract.hasVoted(pollId, voterAddr).catch(() => null),
          contract.isVoterAuthorized(pollId, voterAddr).catch(() => null),
        ]);
        // On Hardhat, block timestamp only advances on new blocks, so on-chain
        // isPollStarted may lag behind wall clock. Cross-check with poll times.
        const poll = polls.find(p => p.id === pollId);
        const now = Math.floor(Date.now() / 1000);
        const startedByTime = poll?.startTime ? poll.startTime <= now : false;
        const endedByTime = poll?.endTime ? poll.endTime <= now : false;

        if (ended === true && endedByTime) { setStatus('❌ Vote failed: Voting period has ended'); return; }
        if (started === false && !startedByTime) { setStatus('❌ Vote failed: Voting has not started yet'); return; }
        if (active === false && !startedByTime) { setStatus('❌ Vote failed: Poll is not active'); return; }
        if (voted === true)       { setStatus('❌ Vote failed: You have already voted in this poll'); return; }
        if (authorized === false) { setStatus('❌ Vote failed: You are not registered as a voter for this poll'); return; }
      } catch { /* pre-flight failed — proceed and let the tx report the real error */ }

      const poll = polls.find(p => p.id === pollId);
      let tx;
      if (poll?.canVoteWithToken && poll?.voterTokenBalance > 0) {
        tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.voteInPollWithToken(pollId, optionId, opts || {}) });
      } else {
        tx = await sendTxWithNonceRetry({ signer, sendTx: (opts) => contract.voteInPoll(pollId, optionId, opts || {}) });
      }
      await tx.wait();
      setStatus(`✅ Vote recorded for option ${optionId} in Poll #${pollId}`);
      setVotingOption(null);
      loadPolls();
    } catch (err) {
      const details = getContractErrorDetails(err, getContract(getProvider()));
      setStatus(`❌ Vote failed: ${details.description}`);
    } finally { setLoading(false); }
  };

  // ── Helpers ─────────────────────────────────────────────────────
  const formatTimeRemaining = (endTime) => {
    if (!endTime) return '';
    const remaining = endTime - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return 'Ended';
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const formatStartsIn = (startTime) => {
    if (!startTime) return '';
    const remaining = startTime - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return '';
    const minutes = Math.ceil(remaining / 60);
    return `Voting opens in ~${minutes} min`;
  };

  // Auto-refresh every 30s so upcoming→active transition is visible
  useEffect(() => {
    if (!addr) return;
    const interval = setInterval(() => loadPolls(), 30000);
    return () => clearInterval(interval);
  }, [addr]); // eslint-disable-line

  // Paginated polls
  const pollsPage = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return polls.slice(start, start + pageSize);
  }, [polls, currentPage, pageSize]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="vote-list">
      {/* Account selector (local) */}
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
          {addr && <div className="muted small" style={{ marginTop: 4 }}>Voter: {addr}</div>}
        </div>
      )}

      {!isLocal && !addr && (
        <button onClick={connectWallet} className="btn primary">Connect MetaMask</button>
      )}

      {status && <div className="muted" style={{ marginBottom: 12 }}>{status}</div>}

      {addr && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <span className="chip" style={{ background: IS_V2 ? '#2e7d32' : '#ed6c02', color: 'white' }}>
              {VERSION_LABEL} Upgradeable
            </span>
            <span className="muted small">{polls.length} poll(s) authorized</span>
            <button onClick={loadPolls} className="btn ghost" style={{ fontSize: 12, marginLeft: 'auto' }}>
              🔄 Refresh
            </button>
          </div>

          {loading && <div className="muted">Loading polls...</div>}

          {polls.length === 0 && !loading && (
            <div className="muted" style={{ padding: '1rem' }}>
              No authorized polls found for your address. Ask the admin to add you as a voter.
            </div>
          )}

          {pollsPage.map(poll => {
            const now = Math.floor(Date.now() / 1000);
            const isUpcoming = poll.startTime > now;
            // On-chain status may lag behind wall clock (Hardhat only mines on tx).
            // Treat poll as active if either the chain says so OR wall-clock says so.
            const isActiveOnChain = poll.status?.started && !poll.status?.ended;
            const isActiveByTime = poll.startTime <= now && poll.endTime > now;
            const isActive = isActiveOnChain || isActiveByTime;
            const isEnded = poll.status?.ended || (poll.endTime > 0 && poll.endTime <= now);
            const isPaused = IS_V2 && poll.v2?.isPaused;

            const statusLabel = poll.status?.revealed ? '🏆 Revealed' :
              isEnded ? '⏱️ Ended' :
              isPaused ? '⏸️ Paused' :
              isActive ? '✅ Active' : '📅 Upcoming';

            const canVote = isActive && !isEnded && !poll.hasVoted && !isPaused && !isUpcoming;

            return (
              <div key={poll.id} className={`poll-card ${poll.hasVoted ? 'is-voted' : ''} ${isActive ? 'is-active' : ''}`}>
                <div className="poll-card__head">
                  <div>
                    <h4 className="poll-title">
                      {poll.title}
                      {poll.hasVoted && <span className="chip chip-success" style={{ marginLeft: 8 }}>✓ Voted</span>}
                    </h4>
                    <div className="muted small">{formatTimeRemaining(poll.endTime)}</div>
                    {isUpcoming && <div className="muted small" style={{ color: '#ed6c02' }}>⏳ {formatStartsIn(poll.startTime)}</div>}
                    {poll.canVoteWithToken && poll.voterTokenBalance > 0 && (
                      <div className="muted small">🪙 Token voting ({poll.voterTokenBalance} tokens)</div>
                    )}
                    {/* V2 indicators */}
                    {IS_V2 && poll.v2 && (
                      <>
                        {poll.v2.isPaused && <div className="muted small" style={{ color: '#d32f2f', fontWeight: 'bold' }}>⏸️ PAUSED — voting temporarily suspended</div>}
                        {poll.v2.category && <div className="muted small">📁 Category: <strong>{poll.v2.category}</strong></div>}
                        {poll.v2.description && <div className="muted small">📝 {poll.v2.description}</div>}
                        {poll.v2.voteWeight > 1 && <div className="muted small">⚖️ Your vote weight: <strong>{poll.v2.voteWeight}x</strong></div>}
                        {poll.v2.emergencyEnded && <div className="muted small" style={{ color: '#d32f2f' }}>🚨 Emergency ended</div>}
                      </>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="chip">{statusLabel}</div>
                    <div className="muted small" style={{ marginTop: 4 }}>{poll.totalVotes} vote(s)</div>
                  </div>
                </div>

                {/* Options & vote buttons */}
                {expandedPoll === poll.id ? (
                  <div className="poll-card__body" style={{ marginTop: 12 }}>
                    {poll.options.map(opt => (
                      <div key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border, #eee)' }}>
                        <span>
                          {opt.name}
                          {poll.hasVoted && poll.voterChoice === opt.id && <span style={{ marginLeft: 4, color: '#2e7d32' }}>← your vote</span>}
                          {poll.status?.revealed && <span className="muted small" style={{ marginLeft: 8 }}>({opt.votes} votes)</span>}
                        </span>
                        {canVote && !poll.hasVoted && (
                          <button
                            onClick={() => handleVote(poll.id, opt.id)}
                            className="btn primary"
                            style={{ fontSize: 12, padding: '4px 12px' }}
                            disabled={loading || (votingOption !== null)}
                          >
                            Vote
                          </button>
                        )}
                      </div>
                    ))}
                    {poll.winner && (
                      <div style={{ marginTop: 8, padding: 8, background: '#e8f5e9', borderRadius: 6 }}>
                        <strong>🏆 Winner: {poll.winner.name}</strong> ({poll.winner.votes} votes)
                      </div>
                    )}
                    {poll.options.length === 0 && <div className="muted">No candidates added yet.</div>}
                    <button onClick={() => setExpandedPoll(null)} className="btn ghost" style={{ marginTop: 8, fontSize: 12 }}>
                      Hide candidates
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setExpandedPoll(poll.id)} className="btn ghost" style={{ marginTop: 8, fontSize: 12 }}>
                    Show Candidates & Vote
                  </button>
                )}
              </div>
            );
          })}

          {polls.length > pageSize && (
            <Pagination
              currentPage={currentPage}
              totalItems={polls.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}
    </div>
  );
}
