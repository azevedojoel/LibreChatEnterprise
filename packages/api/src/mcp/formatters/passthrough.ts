import type { OutputFormatterFn } from './types';

/**
 * Identity formatter - returns the input unchanged.
 */
export const passthroughFormatter: OutputFormatterFn = (text) => text;
