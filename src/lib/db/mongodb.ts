import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_reserve_logs';
const dbName = process.env.MONGODB_DB_NAME || 'campus_reserve_logs';

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!global.mongoClientPromise) {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    global.mongoClientPromise = client.connect();
  }
  clientPromise = global.mongoClientPromise;
} else {
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  clientPromise = client.connect();
}

export async function getMongoDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}

export async function checkMongoConnection(): Promise<{ ok: boolean; dbName?: string; error?: string }> {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return { ok: true, dbName: db.databaseName };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

export default clientPromise;
