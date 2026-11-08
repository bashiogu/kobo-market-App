const pgPool = require("../config/pg");
const User = require("../models/user.models");

const crypto = require('crypto');


const Register = async (req, res) => {
    const { firstName, lastName, email, password, role } = req.body;
    const pgClient = await pgPool.connect();
    try {
        if (!firstName || !lastName || !email || !password || !role) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        await pgClient.query('BEGIN');

        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        if (!user) {
            user = newUser({ firstName, lastName, email, password, role });
            await user.save();
            return res.status(201).json({ message: 'newUser created successfully', user: newUser });

         const idString = user._id.toString();

         const insertAvailableQuery = `INSERT INTO accounts (user_id, type) VALUES ($1, $2) RETURNING id;`;
         const availRes = await pgClient.query(insertAvailableQuery, [idString, 'available']);
         const availableAccountId = availRes.rows[0].id;


         const insertEscrowQuery = `INSERT INTO accounts (user_id,type) VALUES ($1, $2) RETURNING id;`;
         const escrowRes = await pgClient.query(insertEscrowQuery, [idString, 'escrow']);
         const escrowAccountId = escrowRes.rows[0].id;

         const txId = crypto.randomUUID();
         const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;

         await pgClient.query(ledgerQuery, [txId, availableAccountId, 0, 'Account opened at zero balance']);
         await pgClient.query(ledgerQuery, [txId, escrowAccountId, 0, 'Escrow tracker opened at zero balance']);
        }

        await pgClient.query('COMMIT');
        return res.status(201).json({ message: 'Registration successful', userId: user._id });








        
    } catch (error) {
        await pgClient.query('ROLLBACK');


        if (error && error.code !== 11000) {
            await User.deleteOne({ email });
        }
        console.log(error);
        return res.status(500).json({ message: 'Registration failed', details: error.message });
    } finally {

        pgClient.release();
    }
};

module.exports = { Register };