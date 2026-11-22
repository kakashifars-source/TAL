require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://tal:tal_dev_pass@localhost:5432/tal_ems',
  pool: { min: 1, max: 10 },
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
};
