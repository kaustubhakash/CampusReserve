import { NextResponse } from 'next/server';
import { checkMySQLConnection } from '@/lib/db/mysql';
import { checkMongoConnection } from '@/lib/db/mongodb';

export async function GET() {
  const [mysqlStatus, mongoStatus] = await Promise.all([
    checkMySQLConnection(),
    checkMongoConnection(),
  ]);

  const healthy = mysqlStatus.ok && mongoStatus.ok;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'CampusReserve API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        mysql: mysqlStatus,
        mongodb: mongoStatus,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
