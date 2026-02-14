const fs = require('fs');
const path = require('path');

const VOTING_SYS = '/Users/ankit/work/git/votingsystem';
const OUT = 'src/contract';

const contracts = [
  { artifact: 'contracts/Voting.sol/Voting.json', output: 'abi.json', label: 'ElectionsManager' },
  { artifact: 'contracts/TokenManager.sol/TokenManager.json', output: 'tokenManager.abi.json', label: 'TokenManager' },
  { artifact: 'contracts/VotingPaymaster.sol/VotingPaymaster.json', output: 'votingPaymaster.abi.json', label: 'VotingPaymaster' },
  { artifact: 'contracts/SecretBallotManager.sol/SecretBallotManager.json', output: 'secretBallotManager.abi.json', label: 'SecretBallotManager' },
  { artifact: 'contracts/FranchiseManager.sol/FranchiseManager.json', output: 'franchiseeManager.json', label: 'FranchiseeManager' },
];

let updated = 0;
for (const { artifact, output, label } of contracts) {
  const fullPath = path.join(VOTING_SYS, 'artifacts', artifact);
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  ${label}: artifact not found at ${fullPath}`);
    continue;
  }
  const { abi } = require(fullPath);
  fs.writeFileSync(path.join(OUT, output), JSON.stringify(abi, null, 2));
  const fns = abi.filter(x => x.type === 'function').length;
  console.log(`✅ ${label}: ${fns} functions → ${output}`);
  updated++;
}

console.log(`\nDone! Updated ${updated}/${contracts.length} ABIs.`);
