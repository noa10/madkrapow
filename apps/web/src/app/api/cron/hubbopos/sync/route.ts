import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/validators/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!env.HUBBOPOS_ENABLED) {
      return NextResponse.json({ skipped: true, message: 'HubboPOS integration is disabled' });
    }

    const { runFullSync } = await import('@/lib/hubbopos/sync');
    const result = await runFullSync('scheduled', 'cron');

    return NextResponse.json({
      success: true,
      syncRunId: result.syncRunId,
      healthCheck: result.healthCheck,
      catalogSync: result.catalogSync,
      orderPull: result.orderPull,
      queueFlush: result.queueFlush,
      queueStats: result.queueStats,
      circuitState: result.circuitState,
      error: result.error,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HubboPOS Cron] Error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
