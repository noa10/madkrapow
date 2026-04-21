import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { z } from 'zod';

const bindSchema = z.object({
  menu_item_id: z.string().guid(),
  modifier_group_id: z.string().guid(),
  is_required: z.boolean().optional().default(false),
});

const batchSchema = z.object({
  menu_item_id: z.string().guid(),
  bindings: z.array(
    z.object({
      modifier_group_id: z.string().guid(),
      is_required: z.boolean().optional().default(false),
    })
  ),
});

const unbindSchema = z.object({
  menu_item_id: z.string().guid(),
  modifier_group_id: z.string().guid(),
});

export async function POST(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validation = bindSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Verify menu item exists
    const { data: menuItem, error: menuItemError } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', validation.data.menu_item_id)
      .single();

    if (menuItemError || !menuItem) {
      return NextResponse.json(
        { error: menuItemError ? `Database error: ${menuItemError.message}` : 'Menu item not found' },
        { status: menuItemError ? 500 : 404 }
      );
    }

    // Verify modifier group exists
    const { data: modifierGroup, error: modifierGroupError } = await supabase
      .from('modifier_groups')
      .select('id')
      .eq('id', validation.data.modifier_group_id)
      .single();

    if (modifierGroupError || !modifierGroup) {
      return NextResponse.json(
        { error: modifierGroupError ? `Database error: ${modifierGroupError.message}` : 'Modifier group not found' },
        { status: modifierGroupError ? 500 : 404 }
      );
    }

    // Check for duplicate binding
    const { data: existing } = await supabase
      .from('menu_item_modifier_groups')
      .select('id')
      .eq('menu_item_id', validation.data.menu_item_id)
      .eq('modifier_group_id', validation.data.modifier_group_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'This modifier group is already bound to this menu item' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('menu_item_modifier_groups')
      .insert({
        menu_item_id: validation.data.menu_item_id,
        modifier_group_id: validation.data.modifier_group_id,
        is_required: validation.data.is_required,
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

export async function PUT(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validation = batchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Verify menu item exists
    const { data: menuItem, error: menuItemError } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', validation.data.menu_item_id)
      .single();

    if (menuItemError || !menuItem) {
      return NextResponse.json(
        { error: menuItemError ? `Database error: ${menuItemError.message}` : 'Menu item not found' },
        { status: menuItemError ? 500 : 404 }
      );
    }

    // Delete all existing bindings for this menu item
    await supabase
      .from('menu_item_modifier_groups')
      .delete()
      .eq('menu_item_id', validation.data.menu_item_id);

    // Insert new bindings
    const bindingsToInsert = validation.data.bindings.map((binding) => ({
      menu_item_id: validation.data.menu_item_id,
      modifier_group_id: binding.modifier_group_id,
      is_required: binding.is_required,
    }));

    const { data, error } = await supabase
      .from('menu_item_modifier_groups')
      .insert(bindingsToInsert)
      .select();

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

export async function DELETE(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validation = unbindSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('menu_item_modifier_groups')
      .delete()
      .eq('menu_item_id', validation.data.menu_item_id)
      .eq('modifier_group_id', validation.data.modifier_group_id);

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
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
