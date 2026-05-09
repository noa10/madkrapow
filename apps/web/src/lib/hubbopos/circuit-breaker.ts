import { getServiceClient } from '@/lib/supabase/server';
import { HubboPosCircuitState, HubboPosCircuitBreakerState, HubboPosCircuitOpenError } from './types';
import { CIRCUIT_STATES, HUBBOPOS_DEFAULTS } from './constants';

const { CLOSED, OPEN, HALF_OPEN } = CIRCUIT_STATES;
const { CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RESET_MS } = HUBBOPOS_DEFAULTS;

let inMemoryState: HubboPosCircuitBreakerState | null = null;

function defaultState(): HubboPosCircuitBreakerState {
  return {
    state: CLOSED,
    failure_count: 0,
    last_failure_at: null,
    last_success_at: null,
    opened_at: null,
  };
}

async function loadState(): Promise<HubboPosCircuitBreakerState> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('store_settings')
    .select('hubbo_pos_circuit_state, hubbo_pos_last_error_at, hubbo_pos_last_sync_at')
    .limit(1)
    .single();

  if (!data) return defaultState();

  const dbState = data.hubbo_pos_circuit_state as HubboPosCircuitState | null;
  const lastErrorAt = data.hubbo_pos_last_error_at as string | null;
  const lastSyncAt = data.hubbo_pos_last_sync_at as string | null;

  let state: HubboPosCircuitState = CLOSED;
  let openedAt: string | null = null;
  let failureCount = 0;

  if (dbState === OPEN) {
    state = OPEN;
    openedAt = lastErrorAt;
    failureCount = CIRCUIT_BREAKER_THRESHOLD;
  } else if (dbState === HALF_OPEN) {
    state = HALF_OPEN;
    failureCount = CIRCUIT_BREAKER_THRESHOLD - 1;
  }

  return {
    state,
    failure_count: failureCount,
    last_failure_at: lastErrorAt,
    last_success_at: lastSyncAt,
    opened_at: openedAt,
  };
}

async function saveState(state: HubboPosCircuitBreakerState): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from('store_settings')
    .update({
      hubbo_pos_circuit_state: state.state,
      hubbo_pos_last_error_at: state.last_failure_at,
      hubbo_pos_last_sync_at: state.last_success_at,
    })
    .eq('id', (await supabase.from('store_settings').select('id').limit(1).single()).data?.id);
}

export function checkCircuit(): void {
  const state = inMemoryState;
  if (!state) return;

  if (state.state === OPEN) {
    const resetMs = CIRCUIT_BREAKER_RESET_MS;
    const openedAt = state.opened_at ? new Date(state.opened_at).getTime() : 0;
    const elapsed = Date.now() - openedAt;

    if (elapsed >= resetMs) {
      state.state = HALF_OPEN;
      return;
    }

    throw new HubboPosCircuitOpenError();
  }
}

export function recordSuccess(): void {
  const state = inMemoryState || defaultState();
  state.state = CLOSED;
  state.failure_count = 0;
  state.last_success_at = new Date().toISOString();

  inMemoryState = state;
  saveState(state).catch(() => {});
}

export function recordFailure(): void {
  const state = inMemoryState || defaultState();
  state.failure_count += 1;
  state.last_failure_at = new Date().toISOString();

  if (state.failure_count >= CIRCUIT_BREAKER_THRESHOLD) {
    state.state = OPEN;
    state.opened_at = state.last_failure_at;
  }

  inMemoryState = state;
  saveState(state).catch(() => {});
}

export async function initCircuitBreaker(): Promise<HubboPosCircuitBreakerState> {
  const state = await loadState();
  inMemoryState = state;
  return state;
}

export function getCircuitState(): HubboPosCircuitBreakerState {
  return inMemoryState || defaultState();
}

export async function resetCircuitBreaker(): Promise<void> {
  const state = defaultState();
  inMemoryState = state;
  await saveState(state);
}
