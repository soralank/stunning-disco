import React, { useEffect, useState } from 'react';
import { getProvider, getContract } from '../contract';

export default function ResultsList({ mode = 'production' }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  async function loadResults() {
    setLoading(true);
    try {
      const provider = getProvider();
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

          if (!status.ended) continue;

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
          }

          results.push({
            id: i,
            title: poll.title,
            admin: poll.admin,
            startTime: Number(poll.startTime),
            endTime,
            totalVotes: status.revealed ? Number(await contract.getTotalVotes(i)) : null,
            options,
            winner,
            revealed: status.revealed
          });
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

    const startPolling = () => {
      if (document.visibilityState !== 'visible') return;
      loadResults();
      resultsInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadResults();
        }
      }, 30000);
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
            No results are available yet. Results appear only after a poll ends and is revealed by the owner.
          </div>
        </div>
      ) : (
        <div>
          <div className="poll-grid">
          {polls.map(poll => (
            <div key={poll.id} className="poll-card">
              <div className="poll-card__head">
                <div>
                  <h4 className="poll-title">Poll #{poll.id}: {poll.title}</h4>
                  <div className="muted small">Admin: {poll.admin}</div>
                </div>
                <span className={`chip ${poll.revealed ? '' : 'chip-warning'}`}>
                  {poll.revealed ? 'Revealed' : 'Ended'}
                </span>
              </div>
              <div className="poll-meta">
                <div>
                  <span>Ended</span>
                  <strong>{formatDateTime(poll.endTime)}</strong>
                </div>
                <div>
                  <span>Total votes</span>
                  <strong>{poll.revealed ? poll.totalVotes : 'Hidden'}</strong>
                </div>
              </div>

              {poll.revealed && poll.winner && (
                <div className="winner-card">
                  <strong>Winner:</strong> {poll.winner.name} ({poll.winner.votes} votes)
                </div>
              )}
              {!poll.revealed && (
                <div className="info-banner">
                  Results are hidden until the owner reveals them.
                </div>
              )}

              <div className="poll-options">
                <h5>Candidates</h5>
                {poll.options.map(option => (
                  <div key={option.id} className="option-row">
                    <span>{option.name}</span>
                    <span className="option-votes">{poll.revealed ? `${option.votes} votes` : '?'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
