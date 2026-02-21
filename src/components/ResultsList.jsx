import React, { useEffect, useState, useMemo } from 'react';
import { getProvider, getContract, getSecretBallotManagerContract } from '../contract';
import { ethers } from 'ethers';
import Pagination from './Pagination';
import SearchBar from './SearchBar';

export default function ResultsList({ mode = 'production' }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [expandedResult, setExpandedResult] = useState(null);

  // Search & pagination
  const [resultsSearch, setResultsSearch] = useState('');
  const [resultsStatusFilter, setResultsStatusFilter] = useState('all');
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(10);

  const filteredResults = useMemo(() => {
    let list = polls;
    if (resultsSearch.trim()) {
      const q = resultsSearch.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || String(p.id).includes(q) || (p.admin && p.admin.toLowerCase().includes(q)));
    }
    if (resultsStatusFilter !== 'all') {
      list = list.filter(p => {
        if (resultsStatusFilter === 'revealed') return !!p.revealed;
        if (resultsStatusFilter === 'ended') return !!p.ended && !p.revealed;
        if (resultsStatusFilter === 'active') return !!p.active;
        return true;
      });
    }
    return list;
  }, [polls, resultsSearch, resultsStatusFilter]);

  const resultsPageItems = useMemo(() => {
    const start = (resultsPage - 1) * resultsPageSize;
    return filteredResults.slice(start, start + resultsPageSize);
  }, [filteredResults, resultsPage, resultsPageSize]);

  // In local mode, connect directly to Hardhat RPC to avoid MetaMask intercepting
  function getEffectiveProvider() {
    if (mode === 'local') {
      const rpc = process.env.REACT_APP_HARDHAT_RPC || 'http://127.0.0.1:8545';
      return new ethers.JsonRpcProvider(rpc);
    }
    return getProvider();
  }

  async function loadResults() {
    setLoading(true);
    try {
      const provider = getEffectiveProvider();
      const contract = getContract(provider);

      let pollsCount = 0;
      try {
        const result = await contract.getPollsCount();
        pollsCount = Number(result);
      } catch (e1) {
        if (e1.code === 'BAD_DATA' && e1.value === '0x') {
          pollsCount = 0;
        } else {
          try {
            const result = await contract.pollsCount();
            pollsCount = Number(result);
          } catch (e2) {
            try {
              const result = await contract.pollCount();
              pollsCount = Number(result);
            } catch (e3) {
              setStatus('Error: Cannot read polls from contract');
              setLoading(false);
              return;
            }
          }
        }
      }

      const latestBlock = { timestamp: Math.floor(Date.now() / 1000) };
      const nowTs = latestBlock.timestamp;
      const results = [];

      for (let i = 1; i <= pollsCount; i++) {
        try {
          const poll = await contract.polls(i);
          if (!poll || !poll.exists) continue;

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
            const isEndedFallback = poll.ended || (endTime && endTime <= nowTs);
            status = {
              ended: isEndedFallback,
              revealed: poll.revealed
            };
          }

          if (typeof status.ended !== 'boolean') {
            status.ended = poll.ended || (endTime && endTime <= nowTs);
          }
          if (typeof status.revealed !== 'boolean') {
            status.revealed = poll.revealed;
          }
          if (typeof status.started !== 'boolean') {
            status.started = startTime ? startTime <= nowTs : true;
          }
          if (typeof status.active !== 'boolean') {
            status.active = status.started && !status.ended;
          }

          const optionsCount = await contract.getOptionsCount(i);
          const options = [];
          for (let j = 1; j <= Number(optionsCount); j++) {
            const option = await contract.getOption(i, j);
            options.push({
              id: Number(option[0]),
              name: option[1],
              votes: status.revealed ? Number(option[2]) : null
            });
          }

          let winner = null;
          let tieResult = null;
          if (status.revealed) {
            try {
              const winnerResult = await contract.getWinner(i);
              winner = {
                id: Number(winnerResult[0]),
                name: winnerResult[1],
                votes: Number(winnerResult[2])
              };
            } catch (err) {
              winner = null;
            }
            // Detect ties: multiple candidates with the same highest vote count
            const maxVotes = Math.max(...options.map(o => o.votes ?? 0));
            if (maxVotes > 0) {
              const topCandidates = options.filter(o => (o.votes ?? 0) === maxVotes);
              if (topCandidates.length > 1) {
                tieResult = { isTie: true, votes: maxVotes, candidates: topCandidates };
              }
            }
          }

          results.push({
            id: i,
            title: poll.title,
            admin: poll.admin,
            startTime,
            endTime,
            totalVotes: status.revealed ? Number(await contract.getTotalVotes(i)) : null,
            options,
            winner,
            tieResult,
            revealed: status.revealed,
            ended: status.ended,
            active: status.active,
            started: status.started
          });

          // Augment with new feature flags
          const lastResult = results[results.length - 1];
          try { lastResult.isSecretBallot = await contract.secretBallot(i); } catch { lastResult.isSecretBallot = false; }
          try { lastResult.quadraticEnabled = await contract.quadraticVotingEnabled(i); } catch { lastResult.quadraticEnabled = false; }
          try { lastResult.maxChoices = Number(await contract.pollMaxChoices(i)); } catch { lastResult.maxChoices = 0; }
          try { lastResult.delegationEnabled = await contract.delegationEnabled(i); } catch { lastResult.delegationEnabled = false; }
          try { lastResult.metadataURI = await contract.getPollMetadata(i); } catch { lastResult.metadataURI = ''; }

          // Secret ballot status
          if (lastResult.isSecretBallot) {
            try {
              const sbmContract = getSecretBallotManagerContract(provider);
              const sbStatus = await sbmContract.getSecretBallotStatus(i);
              lastResult.sbStatus = {
                commits: Number(sbStatus.commits ?? sbStatus[0]),
                reveals: Number(sbStatus.reveals ?? sbStatus[1]),
                inCommitPhase: sbStatus.inCommitPhase ?? sbStatus[3],
                inRevealPhase: sbStatus.inRevealPhase ?? sbStatus[4]
              };
            } catch { lastResult.sbStatus = null; }
          }
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
  }

  useEffect(() => {
    let resultsInterval;
    const refreshMs = Number(process.env.REACT_APP_REFRESH_INTERVAL);

    const startPolling = () => {
      if (document.visibilityState !== 'visible') return;
      loadResults();
      if (refreshMs > 0) {
        resultsInterval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            loadResults();
          }
        }, refreshMs);
      }
    };

    const stopPolling = () => {
      if (resultsInterval) {
        clearInterval(resultsInterval);
        resultsInterval = null;
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
  }, []);


  const formatDateTime = (time) => {
    if (!time) return 'Not set';
    return new Date(time * 1000).toLocaleString();
  };

  if (loading) {
    return <div className="status-banner">Loading results...</div>;
  }

  return (
    <div className="vote-panel">
      {status && (
        <div className={`status-banner ${status.includes('Error') ? 'status-error' : 'status-success'}`}>
          {status}
        </div>
      )}

      {polls.length === 0 ? (
        <div>
          <div className="empty-state">
            No polls found. Create a poll from the admin panel first.
          </div>
        </div>
      ) : (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>Poll Results ({filteredResults.length} of {polls.length})</h3>
          </div>

          <SearchBar
            searchTerm={resultsSearch}
            onSearchChange={(v) => { setResultsSearch(v); setResultsPage(1); }}
            placeholder="Search by title, admin or ID…"
            filters={[
              { id: 'all',      label: 'All',      active: resultsStatusFilter === 'all' },
              { id: 'revealed', label: 'Revealed', active: resultsStatusFilter === 'revealed' },
              { id: 'ended',    label: 'Ended',    active: resultsStatusFilter === 'ended' },
              { id: 'active',   label: 'Active',   active: resultsStatusFilter === 'active' },
            ]}
            onFilterToggle={(id) => { setResultsStatusFilter(id); setResultsPage(1); }}
          />

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Votes</th>
                  <th>Winner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resultsPageItems.map(poll => {
                  const statusLabel = poll.revealed ? 'Revealed' : poll.ended ? 'Ended' : poll.active ? 'Active' : !poll.started ? 'Scheduled' : 'Inactive';
                  const chipClass = poll.revealed ? 'chip-success' : poll.ended ? 'chip-warning' : poll.active ? '' : 'chip-warning';
                  return (
                    <React.Fragment key={poll.id}>
                      <tr>
                        <td>{poll.id}</td>
                        <td>{poll.title}</td>
                        <td><span className={`chip ${chipClass}`}>{statusLabel}</span></td>
                        <td>{formatDateTime(poll.startTime)}</td>
                        <td>{formatDateTime(poll.endTime)}</td>
                        <td>{poll.revealed ? poll.totalVotes : '—'}</td>
                        <td>
                          {poll.revealed && poll.tieResult
                            ? `🤝 Tie (${poll.tieResult.candidates.length}-way, ${poll.tieResult.votes} votes)`
                            : poll.revealed && poll.winner
                            ? `🏆 ${poll.winner.name} (${poll.winner.votes})`
                            : '—'}
                        </td>
                        <td>
                          <button className="btn btn-sm secondary" onClick={() => setExpandedResult(expandedResult === poll.id ? null : poll.id)}>
                            {expandedResult === poll.id ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {expandedResult === poll.id && (
                        <tr>
                          <td colSpan="8" style={{ padding: '0.75rem 1rem', background: 'var(--surface-alt, #f7f8fa)' }}>
                            <div className="muted small" style={{ marginBottom: '0.5rem' }}>Admin: {poll.admin}</div>
                            {poll.isSecretBallot && <span className="chip" style={{ marginRight: 4 }}>Secret Ballot</span>}
                            {poll.quadraticEnabled && <span className="chip" style={{ marginRight: 4 }}>Quadratic</span>}
                            {poll.maxChoices > 0 && <span className="chip" style={{ marginRight: 4 }}>Multi-choice (max {poll.maxChoices})</span>}
                            {poll.delegationEnabled && <span className="chip" style={{ marginRight: 4 }}>Delegation</span>}
                            {poll.isSecretBallot && poll.sbStatus && (
                              <div className="muted small" style={{ marginTop: 4 }}>
                                Phase: {poll.sbStatus.inCommitPhase ? 'Commit' : poll.sbStatus.inRevealPhase ? 'Reveal' : 'Closed'} &bull;
                                Commits: {poll.sbStatus.commits} &bull; Reveals: {poll.sbStatus.reveals}
                              </div>
                            )}
                            {poll.metadataURI && <div className="muted small" style={{ marginTop: 4, wordBreak: 'break-all' }}>Metadata: {poll.metadataURI}</div>}
                            {poll.options.length > 0 && (
                              <div style={{ marginTop: '0.5rem' }}>
                                <strong>Candidates</strong>
                                {poll.revealed && poll.tieResult && (
                                  <div className="winner-card is-tie" style={{ marginTop: '0.5rem' }}>
                                    <strong>🤝 Tie!</strong> {poll.tieResult.candidates.length} candidates tied with {poll.tieResult.votes} vote{poll.tieResult.votes !== 1 ? 's' : ''} each:
                                    <div className="tie-candidates">
                                      {poll.tieResult.candidates.map(c => <span key={c.id} className="chip">{c.name}</span>)}
                                    </div>
                                  </div>
                                )}
                                {poll.revealed && poll.winner && !poll.tieResult && (
                                  <div className="winner-card" style={{ marginTop: '0.5rem' }}>
                                    <strong>🏆 Winner:</strong> {poll.winner.name} ({poll.winner.votes} votes)
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                                  {poll.options.map(option => (
                                    <span key={option.id} className="chip">{option.name} {poll.revealed ? `(${option.votes})` : ''}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {poll.ended && !poll.revealed && (
                              <div className="info-banner" style={{ marginTop: '0.5rem' }}>Poll ended. Results will be revealed by the owner.</div>
                            )}
                            {poll.active && (
                              <div className="info-banner" style={{ marginTop: '0.5rem' }}>Voting in progress.</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {resultsPageItems.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem' }}>No polls match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            totalItems={filteredResults.length}
            page={resultsPage}
            pageSize={resultsPageSize}
            onPageChange={setResultsPage}
            onPageSizeChange={(s) => { setResultsPageSize(s); setResultsPage(1); }}
          />
        </section>
      )}
    </div>
  );
}
