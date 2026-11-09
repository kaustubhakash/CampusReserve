import mysql from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: mysql.Pool | undefined;
}

const poolConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus_reserve',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
  // Ensure MySQL DATETIME values are returned as exact literal strings ('YYYY-MM-DD HH:mm:ss')
  // preserving the campus Asia/Kolkata timezone without automatic JS Date UTC shifts
  dateStrings: true,
  timezone: '+05:30',
};

let pool: mysql.Pool;

if (process.env.NODE_ENV === 'production') {
  pool = mysql.createPool(poolConfig);
} else {
  if (!global.mysqlPool) {
    global.mysqlPool = mysql.createPool(poolConfig);
  }
  pool = global.mysqlPool;
}

export type QueryParams = (string | number | boolean | Date | null | Buffer)[];

export async function query<T extends mysql.QueryResult>(
  sql: string,
  params?: QueryParams
): Promise<T> {
  const [results] = await pool.execute<T>(sql, params as (string | number | boolean | Date | null)[]);
  return results;
}

export async function checkMySQLConnection(): Promise<{ ok: boolean; version?: string; currentDatabase?: string; error?: string }> {
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT VERSION() as version, DATABASE() as current_db');
    const version = rows[0]?.version || 'Unknown';
    const currentDatabase = rows[0]?.current_db || 'Unknown';
    return { ok: true, version, currentDatabase };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

export default pool;
