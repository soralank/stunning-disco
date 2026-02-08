import { ethers } from 'ethers';
import localABI from './abi.json';

let ABI;
try {
	const abiString = process.env.REACT_APP_ABI || process.env.ABI;
	if (abiString) {
		ABI = JSON.parse(abiString);
	} else {
		throw new Error('no abi in env');
	}
} catch (e) {
	// use local ABI file as fallback
	ABI = localABI;
	console.warn('Using local ABI file; failed to parse ABI from env:', e?.message || e);
}

export function getProvider() {
	if (typeof window !== 'undefined' && window.ethereum) {
		return new ethers.BrowserProvider(window.ethereum);
	}
	return new ethers.JsonRpcProvider(process.env.REACT_APP_HARDHAT_RPC || 'http://localhost:8545');
}

export async function getSigner() {
	const p = getProvider();
	if (typeof window !== 'undefined' && window.ethereum) {
		await p.send('eth_requestAccounts', []);
		return p.getSigner();
	}
	const accounts = await p.listAccounts();
	return p.getSigner(accounts[0]);
}

export function getContract(signerOrProvider) {
	const address = process.env.REACT_APP_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;
	if (!address) throw new Error('REACT_APP_CONTRACT_ADDRESS not set');
	return new ethers.Contract(address, ABI, signerOrProvider || getProvider());
}
