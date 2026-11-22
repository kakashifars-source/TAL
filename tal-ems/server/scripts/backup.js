// Full database backup with pg_dump (schedule with cron, e.g. daily at 02:00):
//   0 2 * * * cd /opt/tal-ems/server && npm run backup
require('dotenv').config();
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = process.env.DATABASE_URL || 'postgres://tal:tal_dev_pass@localhost:5432/tal_ems';
const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../storage/backups'));
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `tal-ems-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
execFileSync('pg_dump', ['--format=custom', '--file', file, url], { stdio: 'inherit' });
console.log(`Backup written: ${file}\nRestore with: pg_restore --clean --dbname <DATABASE_URL> "${file}"\nAlso back up the uploads folder: ${path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../storage/uploads'))}`);
