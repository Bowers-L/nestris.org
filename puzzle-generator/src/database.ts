import { Pool, QueryResult, PoolClient } from 'pg';

const [, , ...args] = process.argv;
const DATABSE_ENVIRONMENT = args.find((arg) => arg.startsWith('--db='))?.split('=')[1];
console.log(`Database environment: ${DATABSE_ENVIRONMENT}`);

// Load environment variables
require('dotenv').config({ path: `.env.${DATABSE_ENVIRONMENT}` });

// PostgreSQL setup
const pool = new Pool();

// Function to wait for the initial connection
export const connectToDB = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database.');
    client.release();
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    throw error; // Re-throw the error to handle it further up the call stack
  }
};

export const queryDB = async (text: string, params?: any[]): Promise<QueryResult> => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  //console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
};

export const getDBClient = async (): Promise<PoolClient> => {
  const client: PoolClient = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  // set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
    console.error(`The last executed query on this client was: ${(client as any).lastQuery}`);
  }, 5000);

  // monkey patch the query method to keep track of the last query executed
  (client as any).query = (...args: [string, any[]?]) => {
    (client as any).lastQuery = args;
    return originalQuery(...args);
  };

  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = release;
    return release();
  };

  return client;
};
