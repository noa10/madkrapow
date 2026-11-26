import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { revalidateMenuContent } from '@/lib/menu/revalidate';
import { z } from 'zod';

const createModifierSchema = z.object({
  name: z.string().min(1),
  price_delta_cents: z.number().int().optional().default(0),
  is_default: z.boolean().optional().default(false),
  is_available: z.boolean().optional().default(true),
  modifier_group_id: z.string().guid(),
  sort_order: z.number().int().optional().default(0),
});

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

    const validation = createModifierSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Verify modifier group exists
    const { data: group, error: groupError } = await supabase
      .from('modifier_groups')
      .select('id')
      .eq('id', validation.data.modifier_group_id)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: groupError ? `Database error: ${groupError.message}` : 'Modifier group not found' },
        { status: groupError ? 500 : 404 }
      );
    }

    const { data, error } = await supabase
      .from('modifiers')
      .insert({
        name: validation.data.name,
        price_delta_cents: validation.data.price_delta_cents,
        is_default: validation.data.is_default,
        is_available: validation.data.is_available,
        modifier_group_id: validation.data.modifier_group_id,
        sort_order: validation.data.sort_order,
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

    revalidateMenuContent();
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
