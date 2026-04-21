import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { env } from '@/lib/validators/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!env.HUBBOPOS_ENABLED) {
      return NextResponse.json({ error: 'HubboPOS integration is disabled' }, { status: 400 });
    }

    const { runFullSync } = await import('@/lib/hubbopos/sync');
    const result = await runFullSync('manual', user.id);

    return NextResponse.json({
      success: true,
      syncRunId: result.syncRunId,
      healthCheck: result.healthCheck,
      catalogSync: result.catalogSync,
      orderPull: result.orderPull,
      queueFlush: result.queueFlush,
      queueStats: result.queueStats,
      error: result.error,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HubboPOS Admin Sync] Error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
