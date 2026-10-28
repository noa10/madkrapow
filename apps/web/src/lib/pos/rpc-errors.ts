/**
 * True when an RPC failed because the function is not deployed.
 *
 * PostgREST reports an RPC missing from its schema cache as `PGRST202`;
 * Postgres reports the same condition as `42883` (undefined_function). A route
 * that depends on a recent migration should turn either into a clear "apply
 * the migration" response instead of a generic 500 that reads like a payment
 * failure.
 */
export function isMissingRpcError(
  error: { code?: string | null } | null | undefined
): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}
