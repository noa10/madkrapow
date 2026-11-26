import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { requireAdmin, revalidateMenuContent } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidateMenuContent: vi.fn(),
}));

vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin }));
vi.mock('@/lib/menu/revalidate', () => ({ revalidateMenuContent }));

import * as itemCollection from './items/route';
import * as item from './items/[id]/route';
import * as groupCollection from './modifier-groups/route';
import * as group from './modifier-groups/[id]/route';
import * as modifierCollection from './modifiers/route';
import * as modifier from './modifiers/[id]/route';

const id = '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d';
const context = { params: Promise.resolve({ id }) };

type Write = {
  table: string;
  operation: 'insert' | 'update';
  payload: Record<string, unknown>;
};

function database(options: { deleteError?: { message: string } } = {}) {
  const writes: Write[] = [];

  return {
    writes,
    from(table: string) {
      let operation: 'read' | 'insert' | 'update' | 'delete' = 'read';

      const query = {
        select() {
          return query;
        },
        insert(payload: Record<string, unknown>) {
          operation = 'insert';
          writes.push({ table, operation, payload });
          return query;
        },
        update(payload: Record<string, unknown>) {
          operation = 'update';
          writes.push({ table, operation, payload });
          return query;
        },
        delete() {
          operation = 'delete';
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        single() {
          if (operation === 'delete') {
            throw new Error('DELETE must not depend on a returned row');
          }
          return Promise.resolve({ data: { id }, error: null });
        },
        then(resolve: (value: unknown) => unknown) {
          const result =
            operation === 'delete'
              ? { data: null, error: options.deleteError ?? null }
              : { data: [], error: null };
          return Promise.resolve(result).then(resolve);
        },
      };

      return query;
    },
  };
}

function useDatabase(options: { deleteError?: { message: string } } = {}) {
  const db = database(options);
  requireAdmin.mockResolvedValue({ user: { id }, supabase: db });
  return db;
}

function request(method: string, body?: unknown): NextRequest {
  return new Request('http://localhost/api/admin/menu', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as NextRequest;
}

function onlyWrite(db: ReturnType<typeof database>): Write {
  expect(db.writes).toHaveLength(1);
  return db.writes[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('menu item is_signature', () => {
  it('persists is_signature on create', async () => {
    const db = useDatabase();

    const response = await itemCollection.POST(
      request('POST', {
        name: 'Pad Thai',
        price_cents: 1250,
        category_id: id,
        is_signature: true,
      })
    );

    expect(response.status).toBe(201);
    expect(onlyWrite(db).payload).toMatchObject({ is_signature: true });
  });

  it('defaults is_signature to false when omitted on create', async () => {
    const db = useDatabase();

    const response = await itemCollection.POST(
      request('POST', { name: 'Pad Thai', price_cents: 1250, category_id: id })
    );

    expect(response.status).toBe(201);
    expect(onlyWrite(db).payload.is_signature).toBe(false);
  });

  it('rejects a non-boolean is_signature on create', async () => {
    const db = useDatabase();

    const response = await itemCollection.POST(
      request('POST', {
        name: 'Pad Thai',
        price_cents: 1250,
        category_id: id,
        is_signature: 'yes',
      })
    );

    expect(response.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it('persists is_signature on patch without touching omitted fields', async () => {
    const db = useDatabase();

    const response = await item.PATCH(request('PATCH', { is_signature: true }), context);

    expect(response.status).toBe(200);
    const payload = onlyWrite(db).payload;
    expect(payload.is_signature).toBe(true);
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('is_available');
  });

  it('allows clearing is_signature on patch', async () => {
    const db = useDatabase();

    const response = await item.PATCH(request('PATCH', { is_signature: false }), context);

    expect(response.status).toBe(200);
    expect(onlyWrite(db).payload.is_signature).toBe(false);
  });

  it('accepts a full replacement payload including is_signature', async () => {
    const db = useDatabase();

    const response = await item.PATCH(
      request('PATCH', {
        name: 'Pad Thai',
        description: null,
        price_cents: 1350,
        image_url: null,
        is_available: true,
        category_id: id,
        sort_order: 3,
        is_signature: true,
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(onlyWrite(db).payload).toMatchObject({
      name: 'Pad Thai',
      description: null,
      price_cents: 1350,
      image_url: null,
      is_available: true,
      category_id: id,
      sort_order: 3,
      is_signature: true,
    });
  });

  it('rejects a non-boolean is_signature on patch', async () => {
    const db = useDatabase();

    const response = await item.PATCH(request('PATCH', { is_signature: 1 }), context);

    expect(response.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });
});

describe('modifier group description and min_selections', () => {
  it('persists description and min_selections on create', async () => {
    const db = useDatabase();

    const response = await groupCollection.POST(
      request('POST', {
        name: 'Spice level',
        description: 'Pick how hot you want it',
        min_selections: 2,
        max_selections: 3,
      })
    );

    expect(response.status).toBe(201);
    expect(onlyWrite(db).payload).toMatchObject({
      description: 'Pick how hot you want it',
      min_selections: 2,
    });
  });

  it('persists a null description on create', async () => {
    const db = useDatabase();

    const response = await groupCollection.POST(
      request('POST', { name: 'Extras', description: null, min_selections: 0 })
    );

    expect(response.status).toBe(201);
    expect(onlyWrite(db).payload).toMatchObject({ description: null, min_selections: 0 });
  });

  it('defaults min_selections to 0 and omits description when not provided on create', async () => {
    const db = useDatabase();

    const response = await groupCollection.POST(request('POST', { name: 'Extras' }));

    expect(response.status).toBe(201);
    const payload = onlyWrite(db).payload;
    expect(payload.min_selections).toBe(0);
    expect(payload).not.toHaveProperty('description');
  });

  it('rejects an invalid description or min_selections on create', async () => {
    useDatabase();

    const badDescription = await groupCollection.POST(
      request('POST', { name: 'Extras', description: 42 })
    );
    const negativeMin = await groupCollection.POST(
      request('POST', { name: 'Extras', min_selections: -1 })
    );
    const fractionalMin = await groupCollection.POST(
      request('POST', { name: 'Extras', min_selections: 1.5 })
    );

    expect(badDescription.status).toBe(400);
    expect(negativeMin.status).toBe(400);
    expect(fractionalMin.status).toBe(400);
  });

  it('persists a null description on patch', async () => {
    const db = useDatabase();

    const response = await group.PATCH(request('PATCH', { description: null }), context);

    expect(response.status).toBe(200);
    expect(onlyWrite(db).payload).toMatchObject({ description: null });
  });

  it('persists min_selections 0 on patch', async () => {
    const db = useDatabase();

    const response = await group.PATCH(request('PATCH', { min_selections: 0 }), context);

    expect(response.status).toBe(200);
    expect(onlyWrite(db).payload.min_selections).toBe(0);
  });

  it('omits description and min_selections when not provided on patch', async () => {
    const db = useDatabase();

    const response = await group.PATCH(request('PATCH', { name: 'Spice level' }), context);

    expect(response.status).toBe(200);
    const payload = onlyWrite(db).payload;
    expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('min_selections');
  });

  it('rejects an invalid description or min_selections on patch', async () => {
    useDatabase();

    const badDescription = await group.PATCH(request('PATCH', { description: false }), context);
    const negativeMin = await group.PATCH(request('PATCH', { min_selections: -2 }), context);

    expect(badDescription.status).toBe(400);
    expect(negativeMin.status).toBe(400);
  });
});

describe('modifier is_default and is_available', () => {
  it('persists is_default and is_available on create', async () => {
    const db = useDatabase();

    const response = await modifierCollection.POST(
      request('POST', {
        name: 'Extra egg',
        modifier_group_id: id,
        is_default: true,
        is_available: false,
      })
    );

    expect(response.status).toBe(201);
    expect(onlyWrite(db).payload).toMatchObject({ is_default: true, is_available: false });
  });

  it('defaults is_default to false and is_available to true when omitted on create', async () => {
    const db = useDatabase();

    const response = await modifierCollection.POST(
      request('POST', { name: 'Extra egg', modifier_group_id: id })
    );

    expect(response.status).toBe(201);
    expect(onlyWrite(db).payload).toMatchObject({ is_default: false, is_available: true });
  });

  it('rejects non-boolean flags on create', async () => {
    const db = useDatabase();

    const badDefault = await modifierCollection.POST(
      request('POST', { name: 'Extra egg', modifier_group_id: id, is_default: 'yes' })
    );
    const badAvailable = await modifierCollection.POST(
      request('POST', { name: 'Extra egg', modifier_group_id: id, is_available: 0 })
    );

    expect(badDefault.status).toBe(400);
    expect(badAvailable.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it('persists is_default and is_available on patch', async () => {
    const db = useDatabase();

    const response = await modifier.PATCH(
      request('PATCH', { is_default: true, is_available: false }),
      context
    );

    expect(response.status).toBe(200);
    expect(onlyWrite(db).payload).toMatchObject({ is_default: true, is_available: false });
  });

  it('allows clearing the flags on patch', async () => {
    const db = useDatabase();

    const response = await modifier.PATCH(
      request('PATCH', { is_default: false, is_available: true }),
      context
    );

    expect(response.status).toBe(200);
    expect(onlyWrite(db).payload).toMatchObject({ is_default: false, is_available: true });
  });

  it('omits the flags when not provided on patch', async () => {
    const db = useDatabase();

    const response = await modifier.PATCH(request('PATCH', { name: 'Extra egg' }), context);

    expect(response.status).toBe(200);
    const payload = onlyWrite(db).payload;
    expect(payload).not.toHaveProperty('is_default');
    expect(payload).not.toHaveProperty('is_available');
  });

  it('rejects non-boolean flags on patch', async () => {
    useDatabase();

    const badDefault = await modifier.PATCH(request('PATCH', { is_default: 'yes' }), context);
    const badAvailable = await modifier.PATCH(request('PATCH', { is_available: 0 }), context);

    expect(badDefault.status).toBe(400);
    expect(badAvailable.status).toBe(400);
  });
});

describe('delete without a returned row', () => {
  const deletes: Array<[string, typeof item.DELETE]> = [
    ['menu item', item.DELETE],
    ['modifier group', group.DELETE],
    ['modifier', modifier.DELETE],
  ];

  it.each(deletes)('%s delete succeeds when the trigger archives and returns no row', async (_name, handler) => {
    useDatabase();

    const response = await handler(request('DELETE'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(revalidateMenuContent).toHaveBeenCalledTimes(1);
  });

  it.each(deletes)('%s delete surfaces archive denial errors', async (_name, handler) => {
    useDatabase({ deleteError: { message: 'menu item archive denied' } });

    const response = await handler(request('DELETE'), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Database error: menu item archive denied' });
    expect(revalidateMenuContent).not.toHaveBeenCalled();
  });
});
