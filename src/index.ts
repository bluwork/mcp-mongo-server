import { MongoClient } from 'mongodb';
import { parseArgs } from './config/environment.js';
import { setupServer } from './server/setup.js';

const { uri, dbName, mode } = parseArgs();
const client = new MongoClient(uri);

async function main() {
  try {
    await client.connect();
    console.log('Connected to MongoDB successfully');
    console.log(`Using database: ${dbName}`);
    console.log(`Server mode: ${mode}`);

    await setupServer(client, dbName, mode);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    if (String(error).includes('Authentication failed')) {
      console.error('Authentication failed. Please check your username and password.');
    }
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await client.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await client.close();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  client.close().catch(console.error);
  process.exit(1);
});
