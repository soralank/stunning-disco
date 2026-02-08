const fs = require('fs');
const artifact = require('/Users/ankit/work/git/votingsystem/artifacts/contracts/Voting.sol/Voting.json');
fs.writeFileSync('src/contract/abi.json', JSON.stringify(artifact.abi, null, 2));
console.log('✅ ABI updated!');
console.log('Total functions:', artifact.abi.filter(x => x.type === 'function').length);
