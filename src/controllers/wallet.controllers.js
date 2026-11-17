const pool = require("../config/pg");
const crypto = require("crypto");

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

    balanceRes.rows.forEach((row) => {
      if (row.type === "available")
        availableBalanceKobo = parseInt(row.balance_kobo);
      if (row.type === "escrow") escrowBalanceKobo = parseInt(row.balance_kobo);
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
      transactions: historyRes.rows,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({
        message: "Failed to retrieve wallet summary",
        details: error.message,
      });
  }
};

const FundWallet = async (req, res) => {
  const { amountKobo, paymentReference } = req.body;
  const userId = req.user._id.toString();

  if (!amountKobo || !Number.isInteger(amountKobo) || amountKobo <= 0) {
    return res
      .status(400)
      .json({ message: "amountKobo must be positive whole integer." });
  }

  const pgClient = await pool.connect();

  try {
    await pgClient.query("BEGIN");

    const userAccRes = await pgClient.query(
      `SELECT id FROM accounts WHERE user_id =$1 AND type = 'available';`,
      [userId],
    );
    if (userAccRes.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "User available account not found." });
      const userAvailableAccountId = userAccRes.rows[0].id;

      const gatewayAccRes = await pgClient.query(
        `SELECT id FROM accounts WHERE user_id = 'SYSTEM_GATEWAY_CLEARING' AND type = 'available';`,
      );
      if (gatewayAccRes.rows.length === 0) {
        return res
          .status(400)
          .json({ message: "System gateway clearing account not found." });
      }
      const gatewayAccountId = gatewayAccRes.rows[0].id;

      const txId = crypto.randomUUID();
      const desc = paymentReference
        ? `Wallet funded (Ref: ${paymentReference})`
        : "Wallet funded via gateway";
      const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;

      await pgClient.query(ledgerQuery, [
        txId,
        gatewayAccountId,
        -amountKobo,
        desc,
      ]);
      await pgClient.query(ledgerQuery, [
        txId,
        userAvailableAccountId,
        amountKobo,
        desc,
      ]);

      await pgClient.query("COMMIT");
      return res
        .status(200)
        .json({
          message: "Wallet funded successfully",
          transactionId: txId,
          creditKobo: amountKobo,
        });
    }
  } catch (error) {
    await pgClient.query("ROLLBACK");
    return res
      .status(500)
      .json({ message: "Wallet funding failed", details: error.message });
  } finally {
    pgClient.release();
  }
};


const CashOut = async (req, res) => {
    const { amountKobo } = req.body;
    const userId = req.user._id.toString();

    if (!amountKobo || !Number.isInteger(amountKobo) || amountKobo <= 0) {
        return res.status(400).json({ message: 'amountKobo must be a positive whole integer.'});
    }

    if (!req.user.bankDetails || !req.user.bankDetails.accountNumber || !req.user.bankDetails.bankCode) {
        return res.status(400).json({ message: 'Please update your bank details before requesting a cashOut.' });
    }

    const pgClient = await pool.connect();

    try {
        await pgClient.query('BEGIN');

        const vendorAccRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`, [userId]);
        if (vendorAccRes.rows.length === 0) {
            return res.status(400)({ message: 'Vendor available account not found' });
        }
        const vendorAvailableAccountId = vendorAccRes.rows[0].id;

        const balanceRes = await pgClient.query(`SELECT COALESCE(SUM(amount_kobo), 0) AS balance FROM ledger_entries WHERE account_id = $1;`, [vendorAvailableAccountId]);
        const currentBalance = parseInt(balanceRes.rows[0].balance);

        if (currentBalance < amountKobo) {
            return res.status(400).json({ message: 'Insufficient balance for cashOut.' });
        }

        const payoutAccRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = 'SYSTEM_PAYOUT_CLEARING' AND type = 'available';`);
        if (payoutAccRes.rows.length === 0) {
            return res.status(400).json({ message: 'System payout clearing account not found' });
        }
        const payoutAccountId = payoutAccRes.rows[0].id;

        const txId = crypto.randomUUID();
        const desc = `vendor cashOut to ${req.user.bankDetails.bankCode} - ${req.user.bankDetails.accountNumber}`;
        const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;

        await pgClient.query(ledgerQuery, [txId, vendorAvailableAccountId, -amountKobo, desc]);
        await pgClient.query(ledgerQuery, [txId, payoutAccountId, amountKobo,dsc]);

        await pgClient.query('COMMIT');
        return res.status(200).json({ message: 'CashOut processed successfully', transactionId: txId, withdrawnKobo: amountKobo });
    } catch (error) {
       await pgClient.query('ROLLBACK');
       return res.status(500).json({ message: 'CashOut failed', details: error.message });
    } finally {
        pgClient.release();
    }
};


module.exports = { GetWalletSummary, FundWallet, CashOut };
