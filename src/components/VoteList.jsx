import React, { useEffect, useState } from 'react';
import { getProvider, getSigner, getContract, getContractErrorDetails, sendTxWithNonceRetry } from '../contract';
import { ethers } from 'ethers';

// Read from env or use hardcoded defaults
const DEFAULT_ACCOUNTS = [
  { name: 'Account #0 (Owner)', key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
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

      await loadPolls(address);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function loadPolls(voterAddress) {
    setLoading(true);
    try {
      const provider = getProvider();
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
            try {
              const result = await contract.pollCount();
              pollsCount = Number(result);
            } catch (e3) {
              console.error('Cannot read pollsCount');
              setStatus('Error: Cannot read polls from contract');
              setLoading(false);
              return;
            }
          }
        }
      }

      console.log('Loading polls for voter:', voterAddress, '- Total polls:', pollsCount);
      const pollsData = [];

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

          if (isAuthorized && !isExpired) {
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
          }
        } catch (pollErr) {
          console.warn(`Failed to load poll #${i}:`, pollErr.message);
        }
      }

      console.log('Found', pollsData.length, 'authorized polls for this voter');
      setPolls(pollsData);
    } catch (err) {
      setStatus(`Error loading polls: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadPollOptions(pollId) {
    try {
      const provider = getProvider();
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
      const provider = getProvider();
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
          enabled: Boolean(rawPoll?.tokenVotingEnabled ?? rawPoll?.[8] ?? false),
          required: Boolean(rawPoll?.tokenVotingRequired ?? rawPoll?.[9] ?? false)
        };
      } catch {
      }

      const isTokenEnabledEffective = Boolean(
        tokenConfig.enabled || tokenFlagsFromPoll.enabled || currentPoll?.tokenConfig?.enabled
      );
      const isTokenRequiredEffective = Boolean(
        tokenConfig.tokenRequired || tokenFlagsFromPoll.required || currentPoll?.tokenConfig?.tokenRequired
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
      setStatus(`Error: ${details.description}`);
    }
  }

  async function togglePollDetails(pollId) {
    if (expandedPoll === pollId) {
      setExpandedPoll(null);
    } else {
      const options = await loadPollOptions(pollId);
      const poll = polls.find(p => p.id === pollId);

      let winner = null;
      if (poll.revealed) {
        winner = await loadWinner(pollId);
      }

      setPolls(polls.map(p => p.id === pollId ? { ...p, options, winner } : p));
      setExpandedPoll(pollId);
    }
  }

  useEffect(() => {
    if (addr) {
      setExpandedPoll(null);
      let pollInterval;

      const startPolling = () => {
        if (document.visibilityState !== 'visible') return;
        loadPolls(addr);
        pollInterval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            loadPolls(addr);
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
              Connect with a test account (Accounts #1, #2, #3, #4 are typically authorized as voters)
            </p>
            <div className="account-grid">
              {HARDHAT_ACCOUNTS.slice(1).map((account, index) => (
                <button
                  key={index + 1}
                  className="btn secondary"
                  onClick={() => connectLocalAccount(index + 1)}
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
              {HARDHAT_ACCOUNTS.slice(1).map((account, index) => (
                <button
                  key={index + 1}
                  className={`btn ghost ${selectedAccount === index + 1 && walletSigner ? 'is-active' : ''}`}
                  onClick={() => connectLocalAccount(index + 1)}
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
          You are not authorized to vote in any polls yet.
          <div className="muted">Contact the poll administrator to get authorized.</div>
          {mode === 'local' && (
            <div className="muted small">
              For testing, go to <a href="/local/admin">/local/admin</a> with Account #0 to create a poll and
              authorize this address.
            </div>
          )}
          <div className="muted small">
            Looking for ended polls? Visit the results portal at{' '}
            <a href={mode === 'local' ? '/local/results' : '/results'}>
              {mode === 'local' ? '/local/results' : '/results'}
            </a>.
          </div>
        </div>
      ) : (
        <section className="panel-card panel-card--wide">
          <div className="panel-head">
            <h3>Your Polls</h3>
          </div>
          <div className="poll-grid">
            {polls.map(poll => {
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
                  className={`poll-card ${poll.hasVoted ? 'is-voted' : ''} ${poll.isActive ? 'is-active' : ''}`}
                >
                  <div className="poll-card__head">
                    <div>
                      <h4 className="poll-title">{poll.title}</h4>
                      <div className="muted small">{timeLabel}</div>
                      {statusMessage && <div className="muted small">{statusMessage}</div>}
                      {poll.tokenConfig?.enabled && (
                        <div className="muted small">
                          {poll.tokenConfig.tokenRequired
                            ? `🔐 Token vote required (${poll.voterTokenBalance} tokens)`
                            : `🪙 Token voting enabled (${poll.voterTokenBalance} tokens)`}
                        </div>
                      )}
                      {poll.tokenConfig?.allowGaslessVoting && (
                        <div className="muted small">⛽ Gasless mode enabled (owner paymaster required)</div>
                      )}
                    </div>
                    {poll.hasVoted && <span className="chip chip-success">Voted</span>}
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

                      {poll.revealed && poll.winner && (
                        <div className="winner-card">
                          <strong>Winner:</strong> {poll.winner.name} ({poll.winner.votes} votes)
                        </div>
                      )}

                      {poll.options.map(option => (
                        <div key={option.id} className="option-row">
                          <div>
                            <strong>{option.name}</strong>
                            {poll.revealed && (
                              <div className="muted small">Votes: {option.votes}</div>
                            )}
                          </div>
                          {!isUpcoming && !poll.hasVoted && isActiveEffective && (
                            <button className="btn" onClick={() => vote(poll.id, option.id)}>
                              {poll.tokenConfig?.tokenRequired ? 'Vote with Token' : 'Vote'}
                            </button>
                          )}
                        </div>
                      ))}

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
        </section>
      )}
    </div>
  );
}
