import { ethers } from 'ethers';
import localABI from './electionManager.abi.json';
import localABIV1 from './electionManagerV1.abi.json';
import localABIV2 from './electionManagerV2.abi.json';
import tokenManagerLocalABI from './tokenManager.abi.json';
import votingPaymasterLocalABI from './votingPaymaster.abi.json';
import secretBallotManagerLocalABI from './secretBallotManager.abi.json';
import franchiseeManagerLocalABI from './franchiseeManager.abi.json';
import votingReaderLocalABI from './votingReader.abi.json';
import { devWarn } from '../utils/logger';
import { IS_V2 } from '../utils/contractVersion';

/**
 * Resolve an IPFS URI (ipfs://CID or ipfs://CID/path) to an HTTP gateway URL.
 * Uses REACT_APP_IPFS_GATEWAY env var (should end with /ipfs/).
 * Falls back to https://ipfs.io/ipfs/ if no gateway is configured.
 * Returns the original URI unchanged if it is not an ipfs:// URI.
 */
export function resolveIpfsUri(uri) {
	if (!uri || typeof uri !== 'string') return uri;
	const match = uri.match(/^ipfs:\/\/(.+)/);
	if (!match) return uri;
	const gateway = process.env.REACT_APP_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
	// Ensure gateway ends with /
	const base = gateway.endsWith('/') ? gateway : gateway + '/';
	return base + match[1];
}

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

// ── ABI resolution ──────────────────────────────────────────────────────────
// Final ABI — always used by the original (non-upgradeable) routes
try {
	const abiString = process.env.REACT_APP_ABI || process.env.ABI;
	if (abiString) {
		ABI = resolveElectionsAbi(JSON.parse(abiString));
	} else {
		throw new Error('no abi in env');
	}
} catch (e) {
	ABI = resolveElectionsAbi(localABI);
	devWarn('Using local ABI file (Final); failed to parse ABI from env:', e?.message || e);
}

// Upgradeable ABI — use the exact ABI matching the configured contract version.
// V1 = ElectionsManagerUpgradeable (59 functions)
// V2 = ElectionsManagerUpgradeableV2 (inherits V1 + new features, 73 functions)
const UPGRADEABLE_ABI = resolveElectionsAbi(IS_V2 ? localABIV2 : localABIV1);
devWarn(`Upgradeable ABI: using ${IS_V2 ? 'V2' : 'V1'} (${UPGRADEABLE_ABI.length} entries)`);

// Cache providers to avoid creating duplicate instances (which causes nonce tracking issues)
let _browserProvider = null;
let _jsonRpcProvider = null;
let _injectedProvider = null;

function getInjectedEthereumProvider() {
	if (typeof window === 'undefined' || !window.ethereum) return null;
	const injected = window.ethereum;
	if (Array.isArray(injected.providers) && injected.providers.length > 0) {
		// Prefer MetaMask when multiple wallet extensions inject providers.
		return injected.providers.find((provider) => provider?.isMetaMask) || injected.providers[0];
	}
	return injected;
}

async function ensureExpectedChain(injectedProvider) {
	const expectedChainId = process.env.REACT_APP_CHAIN_ID;
	if (!expectedChainId || !injectedProvider?.request) return;

	const expectedDec = Number(expectedChainId);
	if (!Number.isFinite(expectedDec)) return;
	const expectedHex = `0x${expectedDec.toString(16)}`;

	const currentChainId = await injectedProvider.request({ method: 'eth_chainId' });
	if ((currentChainId || '').toLowerCase() === expectedHex.toLowerCase()) return;

	try {
		await injectedProvider.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: expectedHex }],
		});
	} catch (switchErr) {
		// 4902 = requested chain not added to wallet.
		if (switchErr?.code === 4902 && expectedDec === 11155111) {
			await injectedProvider.request({
				method: 'wallet_addEthereumChain',
				params: [{
					chainId: '0xaa36a7',
					chainName: 'Sepolia',
					nativeCurrency: { name: 'SepoliaETH', symbol: 'SepoliaETH', decimals: 18 },
					rpcUrls: ['https://rpc.sepolia.org'],
					blockExplorerUrls: ['https://sepolia.etherscan.io']
				}],
			});
			await injectedProvider.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: expectedHex }],
			});
			return;
		}
		throw switchErr;
	}
}

export function getProvider() {
	const injected = getInjectedEthereumProvider();
	if (injected) {
		if (!_browserProvider || _injectedProvider !== injected) {
			_injectedProvider = injected;
			_browserProvider = new ethers.BrowserProvider(injected);
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
	const injected = getInjectedEthereumProvider();
	if (injected) {
		await ensureExpectedChain(injected);
		const p = getProvider();
		await p.send('eth_requestAccounts', []);
		return p.getSigner();
	}
	const p = getProvider();
	const accounts = await p.listAccounts();
	return p.getSigner(accounts[0]);
}

/**
 * Get the Final (non-upgradeable) ElectionsManager contract.
 * Used by the original /admin, /voter, /results routes.
 */
export function getContract(signerOrProvider) {
	const address = getEnvValue(
		'REACT_APP_CONTRACT_ADDRESS',
		'NEXT_PUBLIC_ELECTIONS_MANAGER_ADDRESS',
		'CONTRACT_ADDRESS'
	);
	if (!address) throw new Error('REACT_APP_CONTRACT_ADDRESS not set');
	return new ethers.Contract(address, ABI, signerOrProvider || getProvider());
}

/**
 * Get the Upgradeable (V1/V2 proxy) ElectionsManager contract.
 * Used by the /upgradeable/* routes. Uses V1 or V2 ABI based on REACT_APP_CONTRACT_VERSION.
 */
export function getUpgradeableContract(signerOrProvider) {
	const address = getEnvValue(
		'REACT_APP_UPGRADEABLE_CONTRACT_ADDRESS'
	);
	if (!address) throw new Error('REACT_APP_UPGRADEABLE_CONTRACT_ADDRESS not set — this address should point to the UUPS proxy');
	devWarn(`getUpgradeableContract: address=${address}, ABI entries=${UPGRADEABLE_ABI.length}`);
	return new ethers.Contract(address, UPGRADEABLE_ABI, signerOrProvider || getProvider());
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

/**
 * Deploy a new VotingPaymaster contract from the browser.
 * @param {ethers.Signer} signer – the deployer (owner) signer
 * @param {string} votingContract – ElectionsManager address
 * @param {string} tokenManager – TokenManager address
 * @param {string} admin – address that will administer this paymaster (franchisee)
 * @returns {Promise<ethers.Contract>} the deployed contract (already waited for deployment)
 */
export async function deployVotingPaymaster(signer, votingContract, tokenManager, admin) {
	const { bytecode } = await import('./votingPaymaster.bytecode.json');
	const factory = new ethers.ContractFactory(VOTING_PAYMASTER_ABI, bytecode, signer);
	const contract = await factory.deploy(votingContract, tokenManager, admin);
	await contract.waitForDeployment();
	return contract;
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

/**
 * Detect gas-estimation failures that ethers v6 can mask as misleading errors
 * (e.g. "insufficient funds for intrinsic transaction cost" or "missing revert data").
 * These occur on Hardhat v3 with proxy contracts (UUPS/ERC-1967) because
 * eth_estimateGas returns an internal error while eth_call succeeds.
 */
function isGasEstimationError(err) {
	const message = (err?.shortMessage || err?.message || String(err || '')).toLowerCase();
	return (
		err?.code === 'CALL_EXCEPTION' ||
		err?.code === 'UNKNOWN_ERROR' ||
		err?.code === 'INSUFFICIENT_FUNDS' ||
		(message.includes('insufficient funds') && message.includes('intrinsic transaction cost')) ||
		(message.includes('missing revert data')) ||
		(message.includes('could not coalesce error')) ||
		(message.includes('internal error'))
	);
}

/** Default gas limit for fallback when estimation fails (1 million gas). */
const FALLBACK_GAS_LIMIT = 1_000_000n;

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

/**
 * Build overrides that bypass all ethers gas/fee estimation.
 * Hardhat v3 + proxy (UUPS/ERC-1967) contracts cause eth_estimateGas to return
 * "Internal error" while eth_call succeeds.  Providing explicit gasLimit AND
 * a legacy gasPrice (type 0) avoids every estimation code-path in ethers v6.
 */
async function buildFallbackOverrides(signer, extra = {}) {
	const overrides = { gasLimit: FALLBACK_GAS_LIMIT, ...extra };
	try {
		const provider = signer.provider || getProvider();
		const feeData = await provider.getFeeData();
		if (feeData.gasPrice) {
			overrides.gasPrice = feeData.gasPrice;
		}
	} catch {
		// If even getFeeData fails, hardcode a safe local-dev gasPrice
		overrides.gasPrice = 1_000_000_000n; // 1 gwei
	}
	return overrides;
}

export async function sendTxWithNonceRetry({ signer, sendTx, onRetry }) {
	let lastErr;
	// First attempt: let ethers pick the nonce automatically
	try {
		return await sendTx();
	} catch (err) {
		if (isGasEstimationError(err)) {
			// Gas estimation failed (common with proxy contracts on Hardhat).
			// Retry with explicit gasLimit + gasPrice to bypass all estimation.
			devWarn('[sendTxWithNonceRetry] Gas estimation failed, retrying with explicit gas overrides:', err?.shortMessage || err?.message);
			try {
				const overrides = await buildFallbackOverrides(signer);
				return await sendTx(overrides);
			} catch (retryErr) {
				// If the explicit-gas retry also fails with a nonce error,
				// fall through to nonce-retry logic below.
				if (!isStaleNonceError(retryErr) && !isGasEstimationError(retryErr)) {
					throw retryErr;
				}
				lastErr = retryErr;
			}
		} else if (!isStaleNonceError(err)) {
			throw err;
		} else {
			lastErr = err;
		}
	}

	// Subsequent retries: manually fetch and increment nonce
	for (let attempt = 1; attempt <= MAX_NONCE_RETRIES; attempt++) {
		onRetry?.();
		try {
			const freshNonce = await getFreshNonce(signer);
			const nonce = freshNonce + (attempt - 1);
			const overrides = await buildFallbackOverrides(signer, { nonce });
			return await sendTx(overrides);
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
	// V1/V2 custom errors (Solidity custom error names)
	POLLSTARTED: 'Poll has already started — candidates and voters must be added before the start time',
	POLLENDED: 'Voting period has ended',
	POLLNOTACTIVE: 'Poll is not active',
	POLLNOTENDED: 'Poll has not ended yet',
	POLLNOTFOUND: 'Poll not found',
	POLLALREADYREVEALED: 'Poll results have already been revealed',
	POLLNOTREVEALED: 'Poll results have not been revealed',
	UNAUTHORIZED: 'You are not authorized to perform this action',
	NOTVOTER: 'You are not registered as a voter for this poll',
	DUPLICATEVOTER: 'This address is already registered as a voter',
	DUPLICATENAME: 'An option with this name already exists',
	DUPLICATETITLE: 'A poll with this title already exists',
	INVALIDOPTION: 'Selected option is invalid',
	EMPTYTITLE: 'Title cannot be empty',
	MAXOPTIONSREACHED: 'Maximum number of options reached',
	STARTTIMEINPAST: 'Start time is in the past',
	STARTTIMETOOFARINFUTURE: 'Start time is too far in the future',
	DURATIONTOOSHORT: 'Poll duration is too short',
	INFRALOCKED: 'Infrastructure is locked and cannot be modified',
	TOKENVOTINGNOTENABLED: 'Token voting is not enabled for this poll',
	TOKENVOTINGREQUIRED: 'This poll requires token-based voting',
	ALREADYVOTED: 'You have already voted in this poll',
	ZEROADDRESS: 'Address cannot be zero',
	// FranchiseManager custom errors
	BADPAYMASTER: 'The franchise paymaster admin does not match the poll admin — the paymaster admin must be transferred to the new franchisee after a franchise transfer',
	CANNOTSELFTRANSFER: 'You cannot transfer a franchise to yourself',
	EXCEEDSPOLLCAP: 'The requested number of polls exceeds the maximum allowed',
	FRANCHISEEXHAUSTED: 'This franchise has used all its allocated polls',
	FRANCHISEEXPIRED: 'This franchise has expired',
	FRANCHISENOTFOUND: 'Franchise not found',
	INSUFFICIENTFEE: 'Insufficient ETH sent — please include the required transfer fee',
	INVALIDPOLLCOUNT: 'Invalid poll count',
	NOFEESTOWITHDRAW: 'No fees available to withdraw',
	NOFRANCHISE: 'You do not have an active franchise',
	NOPLAINETHER: 'This contract does not accept plain ETH transfers',
	NOTRANSFERPENDING: 'No transfer is pending for this franchise',
	ONLYPENDINGOWNER: 'Only the pending owner can perform this action',
	OWNERCANNOTBEFRANCHISEE: 'The contract owner cannot be granted a franchise',
	REENTRANTCALL: 'Reentrant call detected',
	SAMEADDRESS: 'Source and target addresses are the same',
	TARGETHASACTIVEFRANCHISE: 'The target address already has an active franchise',
	TRANSFERFAILED: 'ETH transfer failed',
	TRANSFERPENDING: 'A transfer is already pending for this franchise — approve or reject it first',
	UNKNOWNFUNCTION: 'Unknown function called on the contract',
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

	// Direct match for V1/V2 custom error names (no separators)
	const stripped = code.replace(/[^A-Z0-9]/g, '');
	if (ERROR_MESSAGE_MAP[stripped]) return stripped;

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
	if (revertData && typeof revertData === 'string' && revertData.startsWith('0x')) {
		// Try the passed contract first, then fall back to all known ABIs
		const abiInterfaces = [
			contract?.interface,
			new ethers.Interface(franchiseeManagerLocalABI),
			new ethers.Interface(ABI || localABI),
		].filter(Boolean);
		for (const iface of abiInterfaces) {
			try {
				const parsed = iface.parseError(revertData);
				if (parsed?.name) {
					code = parsed.name;
					if (parsed?.args?.length) {
						const firstArg = parsed.args[0];
						if (typeof firstArg === 'string' && firstArg.trim()) {
							description = firstArg.trim();
						}
					}
					break;
				}
			} catch {
				// This ABI didn't recognize the error selector — try next
			}
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

	// Provide a better fallback for ethers v6 "could not coalesce error" which masks real revert reasons
	const isMaskedError = fallbackMessage.toLowerCase().includes('could not coalesce error')
		|| fallbackMessage.toLowerCase().includes('missing revert data')
		|| fallbackMessage.toLowerCase().includes('internal error');
	const finalDescription = mappedDescription || description
		|| (isMaskedError ? 'Transaction rejected by the contract — the operation may be invalid or you may not be eligible.' : fallbackMessage);

	return {
		code,
		normalizedCode,
		description: finalDescription,
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

/**
 * Fetch the on-chain contract version string by calling getVersion().
 * Returns the version string (e.g. "1.0.0" or "2.0.0"), or null on failure.
 * Works with both V1 and V2 contracts.
 */
export async function fetchContractVersion(signerOrProvider, { upgradeable = false } = {}) {
	try {
		const contract = upgradeable
			? getUpgradeableContract(signerOrProvider)
			: getContract(signerOrProvider);
		const version = await contract.getVersion();
		return version;
	} catch (err) {
		devWarn('Failed to fetch contract version:', err?.message || err);
		return null;
	}
}

/** Re-export version utilities for convenient access */
export { CONTRACT_VERSION, IS_V2, IS_FINAL, VERSION_LABEL } from '../utils/contractVersion';
export { V2_FEATURES, hasFeature } from '../utils/contractVersion';
