/**
 * Platform resolution for `useSolanaSigner`: Metro picks `.web.ts` or `.native.ts`; TypeScript reads this file.
 * The two halves have the same shape. See `solanaSigner.web.ts`.
 */
export * from './solanaSigner.native';
