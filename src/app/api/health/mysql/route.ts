import { NextResponse } from 'next/server';
import { checkMySQLConnection } from '@/lib/db/mysql';

export async function GET() {
  const status = await checkMySQLConnection();

  return NextResponse.json(
    {
      service: 'MySQL 8 (Relational Storage)',
      status: status.ok ? 'connected' : 'error',
      ...status,
      timestamp: new Date().toISOString(),
    },
    { status: status.ok ? 200 : 503 }
  );
}
