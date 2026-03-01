import React, { useEffect, useState, useMemo } from 'react';
import { getProvider, getUpgradeableContract as getContract } from '../contract';
import { IS_V2, VERSION_LABEL } from '../utils/contractVersion';
import Pagination from './Pagination';

export default function UpgradeableResultsList({ mode = 'production' }) {
  const [polls, setPolls] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedPoll, setExpandedPoll] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const loadResults = async () => {
    setLoading(true);
    try {
      const provider = getProvider();
      const contract = getContract(provider);

      let pollsCount;
      try { pollsCount = Number(await contract.getPollsCount()); } catch {
        try { pollsCount = Number(await contract.pollsCount()); } catch { pollsCount = 0; }
      }

      const results = [];
      // V1 contract bug: getPollsCount returns N but polls exist at indices 0..N
      // Index 0 is a phantom empty entry — iterate through count (inclusive) and skip blanks
      for (let i = 0; i <= pollsCount; i++) {
        try {
          const lastResult = { id: i };

          // Title
          try { lastResult.title = await contract.pollTitles(i); } catch {
            try { const p = await contract.polls(i); lastResult.title = p.title || p[0] || ''; } catch { lastResult.title = ''; }
          }
          if (!lastResult.title) continue; // skip phantom empty poll at index 0

          // Status
          try {
            const s = await contract.getPollStatus(i);
            // V1 getPollStatus returns 4 bools: [started, active, ended, revealed]
            lastResult.status = { started: s.started ?? s[0], ended: s.ended ?? s[2], revealed: s.revealed ?? s[3] };
          } catch { lastResult.status = { started: false, ended: false, revealed: false }; }

          // Time (must fetch before filtering so wall-clock augmentation can run)
          try { lastResult.startTime = Number(await contract.getPollStartTime(i)); } catch { lastResult.startTime = 0; }
          try { lastResult.endTime = Number(await contract.getPollEndTime(i)); } catch { lastResult.endTime = 0; }

          // Augment status with wall-clock checks (Hardhat block timestamp lags)
          const now = Math.floor(Date.now() / 1000);
          if (lastResult.startTime && lastResult.startTime <= now && !lastResult.status.started) {
            lastResult.status.started = true;
          }
          if (lastResult.endTime && lastResult.endTime <= now && !lastResult.status.ended) {
            lastResult.status.ended = true;
          }

          // Only show ended polls in results
          if (!lastResult.status.ended && !lastResult.status.revealed) continue;

          // Options with vote counts
          try {
            const count = Number(await contract.getOptionsCount(i));
            lastResult.options = [];
            // V1 contract bug: getOptionsCount returns N but options exist at indices 0..N
            // Index 0 is a phantom empty entry from createPoll — iterate through count (inclusive) and skip blanks
            for (let j = 0; j <= count; j++) {
              try {
                const opt = await contract.getOption(i, j);
                const name = typeof opt === 'string' ? opt : (opt.name ?? opt[0]);
                if (!name) continue; // skip phantom empty option at index 0
                let votes = 0;
                // V1 getVotes() reverts with PollNotRevealed if poll isn't revealed yet
                if (lastResult.status.revealed) {
                  if (typeof opt === 'string') {
                    try { votes = Number(await contract.getVotes(i, j)); } catch { votes = 0; }
                  } else {
                    votes = Number(opt.votes ?? opt[1] ?? 0);
                  }
                }
                lastResult.options.push({ id: j, name, votes });
              } catch { /* skip — index may not exist */ }
            }
          } catch { lastResult.options = []; }

          // Total votes
          try { lastResult.totalVotes = Number(await contract.getTotalVotes(i)); } catch { lastResult.totalVotes = 0; }

          // Winner
          lastResult.revealed = lastResult.status.revealed;
          if (lastResult.revealed) {
            try {
              const w = await contract.getWinner(i);
              // V1 getWinner returns (uint256 winnerId, string winnerName) — NOT (name, votes)
              if (typeof w === 'string') {
                lastResult.winner = { name: w, votes: lastResult.totalVotes || 0 };
              } else {
                // Resolve name: prefer named prop, else detect which positional arg is the string
                const winnerName = w.winnerName ?? w.name ?? (typeof w[1] === 'string' ? w[1] : String(w[0]));
                // Resolve votes: V1 has no votes in getWinner — look up from loaded options or use totalVotes
                let winnerVotes;
                if (w.votes !== undefined) {
                  winnerVotes = Number(w.votes);
                } else {
                  const winnerId = w.winnerId ?? w[0];
                  const matchedOpt = lastResult.options.find(o => o.id === Number(winnerId));
                  winnerVotes = matchedOpt ? matchedOpt.votes : (lastResult.totalVotes || 0);
                }
                lastResult.winner = { name: winnerName, votes: winnerVotes };
              }
            } catch { lastResult.winner = null; }

            // Check for ties
            if (lastResult.options.length > 0 && lastResult.winner) {
              const maxVotes = lastResult.winner.votes;
              const tiedOptions = lastResult.options.filter(o => o.votes === maxVotes);
              if (tiedOptions.length > 1) {
                lastResult.tieResult = { candidates: tiedOptions, votes: maxVotes };
              }
            }
          }

          // V2-exclusive data
          if (IS_V2) {
            const v2Data = {};
            try { v2Data.category = await contract.pollCategories(i); } catch { v2Data.category = ''; }
            try { v2Data.description = await contract.getPollDescription(i); } catch { v2Data.description = ''; }
            try { v2Data.emergencyEnded = await contract.emergencyEnded(i); } catch { v2Data.emergencyEnded = false; }
            try { v2Data.isPaused = await contract.pollPaused(i); } catch { v2Data.isPaused = false; }
            try {
              const stats = await contract.getPollStats(i);
              v2Data.participationRate = Number(stats.participationRate ?? stats[1] ?? 0);
              v2Data.diversity = Number(stats.diversity ?? stats[2] ?? 0);
            } catch { v2Data.participationRate = 0; v2Data.diversity = 0; }
            lastResult.v2 = v2Data;
          }

          results.push(lastResult);
        } catch (err) {
          console.warn(`Failed to load results for poll #${i}:`, err.message);
        }
      }

      setPolls(results);
    } catch (err) {
      setStatus(`Error loading results: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadResults(); }, []); // eslint-disable-line

  // Paginated
  const pollsPage = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return polls.slice(start, start + pageSize);
  }, [polls, currentPage, pageSize]);

  return (
    <div className="results-list">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="chip" style={{ background: IS_V2 ? '#2e7d32' : '#ed6c02', color: 'white' }}>
          {VERSION_LABEL} Upgradeable
        </span>
        <span className="muted small">{polls.length} ended poll(s)</span>
        <button onClick={loadResults} className="btn ghost" style={{ fontSize: 12, marginLeft: 'auto' }}>
          🔄 Refresh
        </button>
      </div>

      {loading && <div className="muted">Loading results...</div>}
      {status && <div className="muted" style={{ marginBottom: 12 }}>{status}</div>}

      {polls.length === 0 && !loading && (
        <div className="muted" style={{ padding: '1rem' }}>
          No ended polls found. Results appear here after polls end.
        </div>
      )}

      {pollsPage.map(poll => {
        const isExpanded = expandedPoll === poll.id;

        return (
          <div key={poll.id} className="poll-card" style={{ marginBottom: 12 }}>
            <div
              className="poll-card__head"
              onClick={() => setExpandedPoll(isExpanded ? null : poll.id)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <h4 className="poll-title">
                  {poll.title}
                  {poll.revealed && <span className="chip chip-success" style={{ marginLeft: 8 }}>🏆 Revealed</span>}
                  {!poll.revealed && <span className="chip" style={{ marginLeft: 8 }}>⏱️ Awaiting Reveal</span>}
                </h4>
                <div className="muted small">
                  Ended: {poll.endTime ? new Date(poll.endTime * 1000).toLocaleString() : 'Unknown'}
                  {' | '}{poll.totalVotes} total vote(s)
                </div>
                {/* V2 indicators */}
                {IS_V2 && poll.v2 && (
                  <div style={{ marginTop: 4 }}>
                    {poll.v2.category && <span className="chip" style={{ marginRight: 4 }}>📁 {poll.v2.category}</span>}
                    {poll.v2.emergencyEnded && <span className="chip chip-warning" style={{ marginRight: 4 }}>🚨 Emergency Ended</span>}
                    {poll.v2.isPaused && <span className="chip chip-warning" style={{ marginRight: 4 }}>⏸️ Paused</span>}
                  </div>
                )}
              </div>
              {poll.winner && !poll.tieResult && (
                <div style={{ textAlign: 'right' }}>
                  <strong>🏆 {poll.winner.name}</strong>
                  <div className="muted small">{poll.winner.votes} votes</div>
                </div>
              )}
              {poll.tieResult && (
                <div style={{ textAlign: 'right' }}>
                  <strong>🤝 Tie!</strong>
                  <div className="muted small">{poll.tieResult.candidates.length} candidates, {poll.tieResult.votes} votes each</div>
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="poll-card__body" style={{ marginTop: 12 }}>
                {IS_V2 && poll.v2?.description && (
                  <div className="muted small" style={{ marginBottom: 8 }}>📝 {poll.v2.description}</div>
                )}
                {IS_V2 && poll.v2 && (poll.v2.participationRate > 0 || poll.v2.diversity > 0) && (
                  <div className="muted small" style={{ marginBottom: 8 }}>
                    📊 Participation: <strong>{poll.v2.participationRate}%</strong>
                    {poll.v2.diversity > 0 && <> &bull; Diversity: <strong>{poll.v2.diversity}%</strong></>}
                  </div>
                )}
                {poll.tieResult && (
                  <div style={{ padding: 8, background: '#fff3e0', borderRadius: 6, marginBottom: 8 }}>
                    <strong>🤝 Tie!</strong> {poll.tieResult.candidates.length} candidates tied with {poll.tieResult.votes} vote(s) each:
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {poll.tieResult.candidates.map(c => <span key={c.id} className="chip">{c.name}</span>)}
                    </div>
                  </div>
                )}
                {poll.options.map(opt => {
                  const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                  const isWinner = poll.winner && poll.winner.name === opt.name;
                  return (
                    <div key={opt.id} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{isWinner ? '🏆 ' : ''}{opt.name}</span>
                        <span>{opt.votes} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isWinner ? '#2e7d32' : '#1976d2', borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
                {!poll.revealed && (
                  <div className="muted small" style={{ marginTop: 8 }}>
                    Waiting for admin to reveal results. Vote counts may not be visible yet.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {polls.length > pageSize && (
        <Pagination page={currentPage} totalItems={polls.length} pageSize={pageSize} onPageChange={setCurrentPage} />
      )}
    </div>
  );
}
