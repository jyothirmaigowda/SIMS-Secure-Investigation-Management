import 'dotenv/config';
import { initDatabase } from './db.ts';

initDatabase()
  .then(() => {
    console.log('[DATABASE] Schema migration and synthetic seed check completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[DATABASE] Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
