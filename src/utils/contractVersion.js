/**
 * Contract Version Configuration
 * ===============================
 * Final (non-upgradeable) routes (/admin, /voter, /results) are always available.
 * This setting controls the ABI used by the /upgradeable/* routes.
 *
 * Set REACT_APP_CONTRACT_VERSION in your .env file:
 *   final → No upgradeable proxy deployed (upgradeable routes hidden/disabled)
 *   1     → V1 (ElectionsManagerUpgradeable) — core voting only
 *   2     → V2 (ElectionsManagerUpgradeableV2) — adds categories, weights,
 *           pause, descriptions, deadline extension, emergency end, stats
 *
 * The UI reads this at startup and conditionally renders version-specific features
 * on the upgradeable routes. For local testing you can toggle between 1/2 by
 * changing .env.development and restarting the dev server.
 */

const envVersionRaw = (process.env.REACT_APP_CONTRACT_VERSION || 'final').toString().trim().toLowerCase();

/** true when using the original non-upgradeable "Final" contract */
export const IS_FINAL = envVersionRaw === 'final' || envVersionRaw === '0' || envVersionRaw === '';

/** Configured contract version number (0 = final, 1 = V1, 2 = V2) */
export const CONTRACT_VERSION = IS_FINAL ? 0 : (parseInt(envVersionRaw, 10) >= 2 ? 2 : 1);

/** Human-readable version label */
export const VERSION_LABEL = IS_FINAL ? 'Final' : `V${CONTRACT_VERSION}`;

/** true when the UI should show V2-exclusive features */
export const IS_V2 = CONTRACT_VERSION >= 2;

/**
 * Feature flags derived from the contract version.
 * Every V2 feature can be checked individually.
 */
export const V2_FEATURES = Object.freeze({
  /** Poll categories (setPollCategory / getPollsByCategory) */
  categories: IS_V2,
  /** Vote weight multiplier 1-10 (setVoteWeight / getVoteWeight) */
  voteWeights: IS_V2,
  /** Pause / unpause polls (pausePoll / unpausePoll) */
  pollPause: IS_V2,
  /** On-chain poll descriptions (setPollDescription / getPollDescription) */
  pollDescriptions: IS_V2,
  /** Extend poll deadline (extendPollDeadline) */
  deadlineExtension: IS_V2,
  /** Emergency end poll (emergencyEndPoll) */
  emergencyEnd: IS_V2,
  /** Poll stats — participation rate & vote diversity (getPollStats) */
  pollStats: IS_V2,
  /** Authorized voter count tracking (setAuthorizedVoterCount) */
  voterCountTracking: IS_V2,
});

/**
 * Helper: check if a specific V2 feature is enabled.
 * @param {string} feature — key from V2_FEATURES
 * @returns {boolean}
 */
export function hasFeature(feature) {
  return V2_FEATURES[feature] === true;
}
