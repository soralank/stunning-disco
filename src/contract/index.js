import { ethers } from 'ethers';
import localABI from './abi.json';
import tokenManagerLocalABI from './tokenManager.abi.json';
import votingPaymasterLocalABI from './votingPaymaster.abi.json';

let ABI;
let TOKEN_MANAGER_ABI = tokenManagerLocalABI;
let VOTING_PAYMASTER_ABI = votingPaymasterLocalABI;

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
	console.warn('Using local ABI file; failed to parse ABI from env:', e?.message || e);
}

export function getProvider() {
	if (typeof window !== 'undefined' && window.ethereum) {
		return new ethers.BrowserProvider(window.ethereum);
	}
	return new ethers.JsonRpcProvider(process.env.REACT_APP_HARDHAT_RPC || 'http://localhost:8545');
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

function isStaleNonceError(err) {
	const message = (err?.shortMessage || err?.message || String(err || '')).toLowerCase();
	return (
		err?.code === 'NONCE_EXPIRED' ||
		(message.includes('nonce') && message.includes('already been used')) ||
		(message.includes('nonce') && message.includes('too low'))
	);
}

async function getPendingNonce(signer) {
	const signerAddress = await signer.getAddress();
	const provider = signer.provider || getProvider();
	return provider.getTransactionCount(signerAddress, 'pending');
}

export async function sendTxWithNonceRetry({ signer, sendTx, onRetry }) {
	try {
		return await sendTx();
	} catch (err) {
		if (!isStaleNonceError(err)) {
			throw err;
		}

		onRetry?.();
		const freshNonce = await getPendingNonce(signer);
		return sendTx({ nonce: freshNonce });
	}
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
