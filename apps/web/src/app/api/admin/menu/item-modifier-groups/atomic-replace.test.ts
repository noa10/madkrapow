import { beforeEach, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { requireAdmin, revalidate } = vi.hoisted(() => ({ requireAdmin: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin }));
vi.mock('@/lib/menu/revalidate', () => ({ revalidateMenuContent: revalidate }));
import { PUT } from './route';

const id = '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d';
const payload = { menu_item_id: id, bindings: [{ modifier_group_id: id, is_required: true }] };
const request = () => new Request('http://localhost/api/admin/menu/item-modifier-groups', { method: 'PUT', body: JSON.stringify(payload) }) as NextRequest;

function client(error: null | { message: string } = null) {
  const query = {
    select: () => query, eq: () => query, delete: () => query, insert: () => query,
    single: async () => ({ data: { id }, error: null }),
    then: (resolve: (value: unknown) => void) => resolve({ data: [], error }),
  };
  return { from: vi.fn((_table: string) => query), rpc: vi.fn(async () => ({ data: [], error })) };
}

beforeEach(() => { vi.clearAllMocks(); });

it('replaces bindings with one atomic RPC and invalidates after success', async () => {
  const supabase = client();
  requireAdmin.mockResolvedValue({ user: { id }, supabase });
  expect((await PUT(request())).status).toBe(200);
  expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('replace_item_modifier_groups', { p_menu_item_id: id, p_bindings: payload.bindings });
  expect(supabase.from.mock.calls.map(call => call[0])).toEqual(['menu_items']);
  expect(revalidate).toHaveBeenCalledOnce();
});

it('does not invalidate when the atomic replacement fails', async () => {
  const supabase = client({ message: 'write failed' });
  requireAdmin.mockResolvedValue({ user: { id }, supabase });
  expect((await PUT(request())).status).toBe(500);
  expect(supabase.rpc).toHaveBeenCalledOnce();
  expect(revalidate).not.toHaveBeenCalled();
});

it('does not issue the replacement for unauthorized callers', async () => {
  const supabase = client();
  requireAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) });
  expect((await PUT(request())).status).toBe(403);
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(revalidate).not.toHaveBeenCalled();
});
