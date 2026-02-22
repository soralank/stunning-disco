const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const abi = require('./src/contract/electionManager.abi.json');
const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// Use owner (Account #0) to fix token config for polls that have tokenVotingEnabled but no pollTokenConfigs
const ownerKey = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const signer = new ethers.Wallet(ownerKey, provider);

(async () => {
  const contract = new ethers.Contract(CONTRACT, abi, signer);
  const count = Number(await contract.getPollsCount());
  console.log('Total polls:', count);

  for (let i = 1; i <= count; i++) {
    const poll = await contract.polls(i);
    if (!poll || !poll.exists) continue;

    const tokenEnabled = poll.tokenVotingEnabled ?? poll[9];
    const tc = await contract.getTokenConfig(i);
    const configEnabled = tc.enabled ?? tc[0];

    if (tokenEnabled && !configEnabled) {
      console.log(`\nPoll #${i} "${poll.title}": tokenVotingEnabled=true but pollTokenConfigs.enabled=false`);
      console.log('  Fixing: calling configureTokenVoting(pollId, true, true, 1, true)...');
      try {
        const tx = await contract.configureTokenVoting(i, true, true, 1, true);
        await tx.wait();
        // Verify
        const tcAfter = await contract.getTokenConfig(i);
        console.log('  FIXED! New tokenConfig:');
        console.log('    enabled:', tcAfter.enabled ?? tcAfter[0]);
        console.log('    allowGaslessVoting:', tcAfter.allowGaslessVoting ?? tcAfter[3]);
      } catch (e) {
        console.log('  FAILED:', e.message?.substring(0, 200));
      }
    } else if (tokenEnabled && configEnabled) {
      console.log(`Poll #${i} "${poll.title}": already configured correctly ✓`);
    }
  }

  console.log('\nDone!');
})().catch(e => console.error('Fatal:', e));
