import { ethers } from 'ethers';
import localABI from './electionManager.abi.json';
import tokenManagerLocalABI from './tokenManager.abi.json';
import votingPaymasterLocalABI from './votingPaymaster.abi.json';
import secretBallotManagerLocalABI from './secretBallotManager.abi.json';
import franchiseeManagerLocalABI from './franchiseeManager.abi.json';
import votingReaderLocalABI from './votingReader.abi.json';
import { devWarn } from '../utils/logger';

let ABI;
let TOKEN_MANAGER_ABI = tokenManagerLocalABI;
let VOTING_PAYMASTER_ABI = votingPaymasterLocalABI;
let SECRET_BALLOT_MANAGER_ABI = secretBallotManagerLocalABI;
let FRANCHISE_MANAGER_ABI = franchiseeManagerLocalABI;
let VOTING_READER_ABI = votingReaderLocalABI;

function resolveElectionsAbi(source) {
	if (Array.isArray(source)) {
		return source;
	}

	if (source && typeof source === 'object') {
		if (Array.isArray(source.ElectionsManager)) {
			return source.ElectionsManager;
		}

		if (source.contracts && Array.isArray(source.contracts.ElectionsManager)) {
			return source.contracts.ElectionsManager;
		}

		const firstArrayValue = Object.values(source).find((value) => Array.isArray(value));
		if (firstArrayValue) {
			return firstArrayValue;
		}
	}

	throw new Error('Unable to resolve ElectionsManager ABI from provided ABI source');
}

try {
	const abiString = process.env.REACT_APP_ABI || process.env.ABI;
	if (abiString) {
		ABI = resolveElectionsAbi(JSON.parse(abiString));
	} else {
		throw new Error('no abi in env');
	}
} catch (e) {
	// use local ABI file as fallback
	ABI = resolveElectionsAbi(localABI);
	devWarn('Using local ABI file; failed to parse ABI from env:', e?.message || e);
}

// Cache providers to avoid creating duplicate instances (which causes nonce tracking issues)
let _browserProvider = null;
let _jsonRpcProvider = null;

export function getProvider() {
	if (typeof window !== 'undefined' && window.ethereum) {
		if (!_browserProvider) {
			_browserProvider = new ethers.BrowserProvider(window.ethereum);
		}
		return _browserProvider;
	}
	// In production, a browser wallet (MetaMask) is required.
	// Only fall back to JSON-RPC in development / local mode.
	const rpcUrl = process.env.REACT_APP_HARDHAT_RPC;
	if (!rpcUrl && process.env.NODE_ENV === 'production') {
		throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet to use this application.');
	}
	if (!_jsonRpcProvider) {
		_jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl || 'http://localhost:8545');
	}
	return _jsonRpcProvider;
}

function getEnvValue(...keys) {
	for (const key of keys) {
		if (process.env[key]) return process.env[key];
	}
	return null;
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
	const address = getEnvValue(
		'REACT_APP_CONTRACT_ADDRESS',
		'NEXT_PUBLIC_ELECTIONS_MANAGER_ADDRESS',
		'CONTRACT_ADDRESS'
	);
	if (!address) throw new Error('REACT_APP_CONTRACT_ADDRESS not set');
	return new ethers.Contract(address, ABI, signerOrProvider || getProvider());
}

export function getTokenManagerContract(signerOrProvider) {
	const address = getEnvValue('REACT_APP_TOKEN_MANAGER_ADDRESS', 'NEXT_PUBLIC_TOKEN_MANAGER_ADDRESS');
	if (!address) throw new Error('REACT_APP_TOKEN_MANAGER_ADDRESS not set');
	return new ethers.Contract(address, TOKEN_MANAGER_ABI, signerOrProvider || getProvider());
}

export function getVotingPaymasterContract(signerOrProvider) {
	const address = getEnvValue('REACT_APP_VOTING_PAYMASTER_ADDRESS', 'NEXT_PUBLIC_VOTING_PAYMASTER_ADDRESS');
	if (!address) throw new Error('REACT_APP_VOTING_PAYMASTER_ADDRESS not set');
	return new ethers.Contract(address, VOTING_PAYMASTER_ABI, signerOrProvider || getProvider());
}

/**
 * Create a VotingPaymaster contract instance at a specific address.
 * Used when a poll has a custom paymaster (per-franchise paymaster).
 */
export function getVotingPaymasterAt(address, signerOrProvider) {
	if (!address) throw new Error('Paymaster address required');
	return new ethers.Contract(address, VOTING_PAYMASTER_ABI, signerOrProvider || getProvider());
}

export function getSecretBallotManagerContract(signerOrProvider) {
	const address = getEnvValue('REACT_APP_SECRET_BALLOT_MANAGER_ADDRESS', 'NEXT_PUBLIC_SECRET_BALLOT_MANAGER_ADDRESS');
	if (!address) throw new Error('REACT_APP_SECRET_BALLOT_MANAGER_ADDRESS not set');
	return new ethers.Contract(address, SECRET_BALLOT_MANAGER_ABI, signerOrProvider || getProvider());
}

export function getFranchiseManagerContract(signerOrProvider) {
	const address = getEnvValue('REACT_APP_FRANCHISE_MANAGER_ADDRESS', 'NEXT_PUBLIC_FRANCHISE_MANAGER_ADDRESS');
	if (!address) throw new Error('REACT_APP_FRANCHISE_MANAGER_ADDRESS not set');
	return new ethers.Contract(address, FRANCHISE_MANAGER_ABI, signerOrProvider || getProvider());
}

export function getVotingReaderContract(signerOrProvider) {
	const address = getEnvValue('REACT_APP_VOTING_READER_ADDRESS', 'NEXT_PUBLIC_VOTING_READER_ADDRESS');
	if (!address) throw new Error('REACT_APP_VOTING_READER_ADDRESS not set');
	return new ethers.Contract(address, VOTING_READER_ABI, signerOrProvider || getProvider());
}

function isStaleNonceError(err) {
	const message = (err?.shortMessage || err?.message || String(err || '')).toLowerCase();
	return (
		err?.code === 'NONCE_EXPIRED' ||
		(message.includes('nonce') && message.includes('already been used')) ||
		(message.includes('nonce') && message.includes('too low'))
	);
}

async function getFreshNonce(signer) {
	const signerAddress = await signer.getAddress();
	const provider = signer.provider || getProvider();
	// Use 'latest' (confirmed count) which is more reliable on Hardhat than 'pending'
	const latestNonce = await provider.getTransactionCount(signerAddress, 'latest');
	let pendingNonce;
	try {
		pendingNonce = await provider.getTransactionCount(signerAddress, 'pending');
	} catch {
		pendingNonce = latestNonce;
	}
	// Use the higher of the two to avoid reusing a nonce
	return Math.max(latestNonce, pendingNonce);
}

const MAX_NONCE_RETRIES = 3;

export async function sendTxWithNonceRetry({ signer, sendTx, onRetry }) {
	let lastErr;
	// First attempt: let ethers pick the nonce automatically
	try {
		return await sendTx();
	} catch (err) {
		if (!isStaleNonceError(err)) {
			throw err;
		}
		lastErr = err;
	}

	// Subsequent retries: manually fetch and increment nonce
	for (let attempt = 1; attempt <= MAX_NONCE_RETRIES; attempt++) {
		onRetry?.();
		try {
			const freshNonce = await getFreshNonce(signer);
			// On later retries, bump nonce in case there are untracked pending txs
			const nonce = freshNonce + (attempt - 1);
			return await sendTx({ nonce });
		} catch (err) {
			if (!isStaleNonceError(err)) {
				throw err;
			}
			lastErr = err;
		}
	}

	throw lastErr;
}

const ERROR_MESSAGE_MAP = {
	ALREADY_VOTED: 'You have already voted in this poll',
	NOT_AUTHORIZED: 'You are not authorized to vote in this poll',
	POLL_TIME_OVER: 'Voting period has ended',
	POLL_ENDED: 'Voting period has ended',
	TOKEN_REQUIRED: 'This poll requires token-based voting',
	INSUFFICIENT_TOKENS: 'Insufficient voting token balance',
	INVALID_OPTION: 'Selected option is invalid',
	POLL_NOT_STARTED: 'Voting has not started yet',
};

function readRevertData(err) {
	return (
		err?.data ||
		err?.error?.data ||
		err?.info?.error?.data ||
		err?.receipt?.revertReason ||
		null
	);
}

function normalizeCode(rawCode = '') {
	const code = String(rawCode || '').toUpperCase();
	if (!code) return null;

	if (code.includes('ALREADY') && code.includes('VOT')) return 'ALREADY_VOTED';
	if (code.includes('NOT') && code.includes('AUTH')) return 'NOT_AUTHORIZED';
	if (code.includes('AUTH') && code.includes('FAIL')) return 'NOT_AUTHORIZED';
	if (code.includes('TIME') && (code.includes('OVER') || code.includes('END'))) return 'POLL_TIME_OVER';
	if (code.includes('POLL') && code.includes('END')) return 'POLL_ENDED';
	if (code.includes('TOKEN') && code.includes('REQUIR')) return 'TOKEN_REQUIRED';
	if (code.includes('INSUFFICIENT') && code.includes('TOKEN')) return 'INSUFFICIENT_TOKENS';
	if (code.includes('INVALID') && code.includes('OPTION')) return 'INVALID_OPTION';
	if (code.includes('NOT') && code.includes('START')) return 'POLL_NOT_STARTED';

	return code;
}

export function getContractErrorDetails(err, contract) {
	const messageCandidates = [
		err?.shortMessage,
		err?.reason,
		err?.message,
		err?.error?.message,
		err?.error?.reason,
		err?.info?.error?.message,
		err?.info?.error?.reason,
		err?.info?.payload?.error?.message,
		String(err || 'Unknown error'),
	].filter(Boolean);

	const fallbackMessage = messageCandidates[0] || 'Unknown error';
	let code = null;
	let description = null;

	const revertData = readRevertData(err);
	if (revertData && typeof revertData === 'string' && revertData.startsWith('0x') && contract?.interface?.parseError) {
		try {
			const parsed = contract.interface.parseError(revertData);
			if (parsed?.name) {
				code = parsed.name;
			}
			if (parsed?.args?.length) {
				const firstArg = parsed.args[0];
				if (typeof firstArg === 'string' && firstArg.trim()) {
					description = firstArg.trim();
				}
			}
		} catch {
		}
	}

	if (!description) {
		for (const candidate of messageCandidates) {
			const revertReasonMatch = String(candidate).match(/execution reverted(?::\s*|\s+with reason string\s*)["']?([^"'\n]+)["']?/i);
			if (revertReasonMatch?.[1]) {
				description = revertReasonMatch[1].trim();
				break;
			}

			const quotedReasonMatch = String(candidate).match(/["']([^"']*(insufficient\s+tokens|requires\s+token-based\s+voting|already\s+voted|not\s+authorized|poll\s+time\s+over)[^"']*)["']/i);
			if (quotedReasonMatch?.[1]) {
				description = quotedReasonMatch[1].trim();
				break;
			}
		}
	}

	if (!code && description) {
		const prefixedCode = description.match(/^([A-Z][A-Z0-9_:-]{2,})[:\s-]*/);
		if (prefixedCode?.[1]) {
			code = prefixedCode[1];
		}
	}

	if (!code) {
		const messageCode = fallbackMessage.match(/\b([A-Z][A-Z0-9_]{2,})\b/);
		if (messageCode?.[1]) {
			code = messageCode[1];
		}
	}

	const normalizedCode = normalizeCode(code || description || fallbackMessage);
	const mappedDescription = normalizedCode ? ERROR_MESSAGE_MAP[normalizedCode] : null;

	return {
		code,
		normalizedCode,
		description: mappedDescription || description || fallbackMessage,
		rawMessage: fallbackMessage,
	};
}

/**
 * Verify the connected wallet is on the expected chain.
 * Returns null if OK, or a warning string if chain mismatch detected.
 */
export async function verifyChainId(providerOrSigner) {
	const expectedChainId = process.env.REACT_APP_CHAIN_ID;
	if (!expectedChainId) {
		if (process.env.NODE_ENV === 'production') {
			return 'REACT_APP_CHAIN_ID is not configured — cannot verify network safety. Please contact the site administrator.';
		}
		return null; // dev mode: skip if not configured
	}
	try {
		const provider = providerOrSigner?.provider || providerOrSigner || getProvider();
		const network = await provider.getNetwork();
		const actual = Number(network.chainId);
		const expected = Number(expectedChainId);
		if (actual !== expected) {
			return `Wrong network: connected to chain ${actual} (${network.name || 'unknown'}) but expected chain ${expected}. Please switch networks in your wallet.`;
		}
	} catch (err) {
		return `Unable to verify network: ${err.message || 'unknown error'}. Please check your wallet connection.`;
	}
	return null;
}
