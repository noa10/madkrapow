import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { requireAdmin, revalidateTag, revalidatePath } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin }));
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }));
vi.mock('@/lib/menu/revalidate', () => import('../../../../lib/menu/revalidate'));

import * as categories from './categories/route';
import * as category from './categories/[id]/route';
import * as groups from './modifier-groups/route';
import * as group from './modifier-groups/[id]/route';
import * as modifiers from './modifiers/route';
import * as modifier from './modifiers/[id]/route';
import * as bindings from './item-modifier-groups/route';

const id = '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d';
const context = { params: Promise.resolve({ id }) };
const binding = { menu_item_id: id, modifier_group_id: id };

type Handler = (req: NextRequest, ctx: typeof context) => Promise<Response>;
const cases: Array<{ name: string; handler: Handler; method: string; body?: unknown; status: number }> = [
  { name: 'create category', handler: categories.POST, method: 'POST', body: { name: 'Food' }, status: 201 },
  { name: 'update category order', handler: category.PATCH, method: 'PATCH', body: { sort_order: 2 }, status: 200 },
  { name: 'delete category', handler: category.DELETE, method: 'DELETE', status: 200 },
  { name: 'create modifier group', handler: groups.POST, method: 'POST', body: { name: 'Extras' }, status: 201 },
  { name: 'update modifier group order', handler: group.PATCH, method: 'PATCH', body: { sort_order: 2 }, status: 200 },
  { name: 'delete modifier group', handler: group.DELETE, method: 'DELETE', status: 200 },
  { name: 'create modifier', handler: modifiers.POST, method: 'POST', body: { name: 'Egg', modifier_group_id: id }, status: 201 },
  { name: 'update modifier order', handler: modifier.PATCH, method: 'PATCH', body: { sort_order: 2 }, status: 200 },
  { name: 'delete modifier', handler: modifier.DELETE, method: 'DELETE', status: 200 },
  { name: 'bind modifier group', handler: bindings.POST, method: 'POST', body: binding, status: 201 },
  { name: 'replace bindings', handler: bindings.PUT, method: 'PUT', body: { menu_item_id: id, bindings: [{ modifier_group_id: id }] }, status: 200 },
  { name: 'clear bindings', handler: bindings.PUT, method: 'PUT', body: { menu_item_id: id, bindings: [] }, status: 200 },
  { name: 'unbind modifier group', handler: bindings.DELETE, method: 'DELETE', body: binding, status: 200 },
];

function request(method: string, body?: unknown): NextRequest {
  return new Request('http://localhost/api/admin/menu', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as NextRequest;
}

function database(failMutation = false) {
  return {
    rpc() {
      return Promise.resolve({
        data: failMutation ? null : [{ modifier_group_id: id, is_required: false }],
        error: failMutation ? { message: 'write failed' } : null,
      });
    },
    from(table: string) {
      let operation = 'read';
      const result = () => ({
        data: operation === 'read' && table === 'menu_item_modifier_groups' ? null : { id },
        error: operation !== 'read' && failMutation ? { message: 'write failed' } : null,
      });
      const query = {
        select() { return query; },
        insert() { operation = 'insert'; return query; },
        update() { operation = 'update'; return query; },
        delete() { operation = 'delete'; return query; },
        eq() { return query; },
        order() { return query; },
        single() { return Promise.resolve(result()); },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ user: { id }, supabase: database() });
});

describe('admin menu cache invalidation', () => {
  it.each(cases)('$name expires storefront caches after a successful mutation', async ({ handler, method, body, status }) => {
    const response = await handler(request(method, body), context);
    expect(response.status).toBe(status);
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('menu', { expire: 0 });
    expect(revalidatePath.mock.calls).toEqual([['/'], ['/order'], ['/cart'], ['/item/[id]', 'page']]);
  });

  it.each(cases)('$name leaves caches alone when authorization fails', async ({ handler, method, body }) => {
    requireAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await handler(request(method, body), context)).status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(cases)('$name leaves caches alone when the database rejects the mutation', async ({ handler, method, body }) => {
    requireAdmin.mockResolvedValue({ user: { id }, supabase: database(true) });
    expect((await handler(request(method, body), context)).status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('does not invalidate on invalid input or a read', async () => {
    expect((await categories.POST(request('POST', {}))).status).toBe(400);
    expect((await categories.GET(request('GET'))).status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
