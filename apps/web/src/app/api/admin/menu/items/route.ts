import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { z } from 'zod';

const createItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  price_cents: z.number().int().min(0),
  image_url: z.string().nullable().optional(),
  is_available: z.boolean().optional().default(true),
  category_id: z.string().guid(),
  sort_order: z.number().int().optional().default(0),
});

export async function GET(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get('category_id');

    let query = supabase
      .from('menu_items')
      .select('*, categories(name)')
      .order('sort_order', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = getNextErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { user, supabase } = result;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validation = createItemSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        ...validation.data,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = getNextErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getNextErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : 'Internal server error';
}
