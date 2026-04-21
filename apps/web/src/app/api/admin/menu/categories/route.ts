import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { z } from 'zod';

const createCategorySchema = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

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

    const validation = createCategorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('categories')
      .insert(validation.data)
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
