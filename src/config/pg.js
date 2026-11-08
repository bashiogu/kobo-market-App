

const { Pool } = require('pg');
require('dotenv').config();

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pgPool.query('SELECT NOW()')
.then(() => console.log('connected to PostgreSQL successfully'))
.catch(error => {
    console.error('PostgreSQL connection error:', error);
    process.exit(1);
});


module.exports = pgPool;