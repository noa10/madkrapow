import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin/require-admin';
import { MENU_CACHE_TAG } from '@/lib/queries/menu';
import { z } from 'zod';

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  price_cents: z.number().int().min(0).optional(),
  image_url: z.string().nullable().optional(),
  is_available: z.boolean().optional(),
  category_id: z.string().guid().optional(),
  sort_order: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { id } = await params;

    const { data, error } = await supabase
      .from('menu_items')
      .select('*, categories(name)')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: error.code === 'PGRST116' ? 404 : 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = getNextErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { id } = await params;

    // Verify item exists
    const { data: existing, error: fetchError } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: fetchError ? `Database error: ${fetchError.message}` : 'Menu item not found' },
        { status: fetchError ? 500 : 404 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validation = updateItemSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('menu_items')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    // The item page and storefront are cached (ISR + data cache); drop both
    // so an edit is visible immediately instead of after the 60s window.
    revalidateTag(MENU_CACHE_TAG, { expire: 0 });
    revalidatePath('/');
    revalidatePath(`/item/${data.slug}`);

    return NextResponse.json({ data });
  } catch (error) {
    const message = getNextErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { id } = await params;

    const { data: deleted, error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id)
      .select('slug');

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    revalidateTag(MENU_CACHE_TAG, { expire: 0 });
    revalidatePath('/');
    for (const row of deleted ?? []) {
      revalidatePath(`/item/${row.slug}`);
    }

    return NextResponse.json({ success: true });
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
