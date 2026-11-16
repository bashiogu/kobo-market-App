const pool = require("../config/pg");


const GetWalletSummary = async (req, res) => {
    const userId = req.user._id.toString();

    try {
        const balanceQuery = `
        SELECT
        a.type,
        COALESCE(SUM(le.amount_kobo), 0) AS balance_kobo
        FROM accounts a
        LEFT JOIN ledger_entries le ON a.id le.account_id
        WHERE a.user_id = $1
        GROUP By a.type;
        `;

        const balanceRes = await pool.query(balanceQuery, [userId]);

        let availableBalanceKobo = 0;
        let escrowBalanceKobo = 0;

        balanceRes.rows.forEach(row => {
            if (row.type === 'available') availableBalanceKobo = parseInt(row.balance_kobo);
            if (row.type === 'escrow') escrowBalanceKobo = parseInt(row.balance_kobo);
        });

        const historyQuery = `
        SELECT
        le,id,
        le.transaction_id,
        a.type AS account_type,
        le.amount_kobo,
        le.description,
        le.created_at
        FROM ledger_entries le
        JOIN accounts a ON le.account_id = a.id
        WHERE a.user_id = $1
        ORDER BY le.created_at DESC;
        `;
        const historyRes = await pool.query(historyQuery, [userId]);

        return res.status(200).json({
            userid,
            availableBalanceKobo,
            escrowBalanceKobo,
            transactions: historyRes.rows
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to retrieve wallet summary', details: error.message });
    }
};


module.exports = { GetWalletSummary };