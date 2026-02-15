/**
 * Development-only logger. All output is suppressed in production builds.
 * Usage: import { devLog, devWarn, devError } from '../utils/logger';
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

export function devLog(...args) {
  if (IS_DEV) console.log(...args);
}

export function devWarn(...args) {
  if (IS_DEV) console.warn(...args);
}

export function devError(...args) {
  if (IS_DEV) console.error(...args);
}
