import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { ensureSuperAdmin } from './bootstrap.js';

const db = openDb(config.dbPath);
if (ensureSuperAdmin(db)) {
  console.log(`[bootstrap] Super admin yaratildi: login="${config.superAdminLogin}"`);
}

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`LC CRM ishga tushdi: http://localhost:${config.port}`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
