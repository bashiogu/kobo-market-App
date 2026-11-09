const pg = require('pg');
require('dotenv').config();


const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});


pool.query('SELECT NOW()')
.then(() => console.log('connected to PostgreSQL successfully'))
.catch(error => {
    console.error('PostgreSQL connection error:', error);
    process.exit(1);
});


module.exports = pool;