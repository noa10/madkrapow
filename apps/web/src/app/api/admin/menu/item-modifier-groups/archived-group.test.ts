import { beforeEach, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { requireAdmin, revalidate } = vi.hoisted(() => ({ requireAdmin: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin }));
vi.mock('@/lib/menu/revalidate', () => ({ revalidateMenuContent: revalidate }));
import { POST } from './route';

const itemId = '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d';
const groupId = '9c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f';
const payload = { menu_item_id: itemId, modifier_group_id: groupId };
const request = () => new Request('http://localhost/api/admin/menu/item-modifier-groups', {
  method: 'POST',
  body: JSON.stringify(payload),
}) as NextRequest;

function client(rows: Record<string, { id: string; archived_at?: string | null }>) {
  const inserted: unknown[] = [];
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: rows[table] ?? null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: (value: unknown) => { inserted.push(value); return query; },
    };
    return query;
  });
  return { supabase: { from }, inserted };
}

beforeEach(() => { vi.clearAllMocks(); });

it('rejects binding an archived modifier group before inserting', async () => {
  const { supabase, inserted } = client({
    menu_items: { id: itemId, archived_at: null },
    modifier_groups: { id: groupId, archived_at: '2026-11-26T00:00:00Z' },
  });
  requireAdmin.mockResolvedValue({ user: { id: itemId }, supabase });

  const response = await POST(request());

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Cannot bind an archived modifier group' });
  expect(inserted).toEqual([]);
  expect(revalidate).not.toHaveBeenCalled();
});

it('rejects binding to an archived menu item before inserting', async () => {
  const { supabase, inserted } = client({
    menu_items: { id: itemId, archived_at: '2026-11-26T00:00:00Z' },
  });
  requireAdmin.mockResolvedValue({ user: { id: itemId }, supabase });

  const response = await POST(request());

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Cannot bind options to an archived menu item' });
  expect(inserted).toEqual([]);
  expect(revalidate).not.toHaveBeenCalled();
});

it('binds when the archival migration has not added archived_at yet', async () => {
  const { supabase, inserted } = client({
    menu_items: { id: itemId },
    modifier_groups: { id: groupId },
  });
  requireAdmin.mockResolvedValue({ user: { id: itemId }, supabase });

  const response = await POST(request());

  expect(response.status).toBe(201);
  expect(inserted).toHaveLength(1);
  expect(revalidate).toHaveBeenCalledOnce();
});
