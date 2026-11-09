import { NextResponse } from 'next/server';
import { checkMongoConnection } from '@/lib/db/mongodb';

export async function GET() {
  const status = await checkMongoConnection();

  return NextResponse.json(
    {
      service: 'MongoDB (NoSQL Audit & Activity Logs)',
      status: status.ok ? 'connected' : 'error',
      ...status,
      timestamp: new Date().toISOString(),
    },
    { status: status.ok ? 200 : 503 }
  );
}
