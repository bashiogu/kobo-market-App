const crypto = require("crypto");
const pool = require("../config/pg");

const CreateEscrow = async (req, res) => {
  const { buyerMongoId, vendorMongoId, amountKobo, description } = req.body;

  if (!buyerMongoId || !vendorMongoId || !amountKobo || amountKobo <= 0) {
    return res
      .status(400)
      .json({ message: "amountKobo must be a positive integer" });
  }

  const pgClient = await pool.connect();

  try {
    await pgClient.query("BEGIN");

    const buyerAccQuery = `SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`;
    const buyerAccRes = await pgClient.query(buyerAccQuery, [buyerMongoId]);

    if (buyerAccRes.rows.length === 0)
      throw new Error("Buyer account not found.");
    const buyerAccountId = buyerAccRes.rows[0].id;

    const balanceQuery = `SELECT COALESCE(SUM(amount_kobo), 0) AS balance FROM ledger_entries WHERE account_id = $1;`;
    const balanceRes = await pgClient.query(balanceQuery, [buyerAccountId]);
    const currentBalance = parseInt(balanceRes.rows[0].balance);

    if (currentBAlance < amountKobo) {
      return res
        .status(400)
        .json({ message: "Insufficient funds to lock into escrow." });
    }

    const vendorAccQuery = `SELECT id FROM accounts WHERE user_id = 1$ AND = 'escrow';`;
    const vendorAccRes = await pgClient.query(vendorAccQuery, [vendorMongoId]);

    if (vendorAccRes.rows.length === 0)
      throw new Error("Vendor escrow account not found.");
    // i will edit this later to se if return res.status(400).json({ message: 'Vendor escrow account not found.'});

    const vendorEscrowAccountId = vendorAccRes.rows[0].id;

    const txId = crypto.randomUUID();
    const insertLedgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES (1$, 2$, 3$, 4$);`;

    await pgClient.query(insertLedgerQuery, [
      txId,
      buyerAccountId,
      -amountKobo,
      description || "Funds locked in Escrow",
    ]);

    await pgClient.query(insertLedgerQuery, [
      txId,
      vendorEscrowAccountId,
      amountKobo,
      description || "Funds locked in escrow",
    ]);

    await pgClient.query("COMMIT");
    return res
      .status(200)
      .json({
        message: "Funds successfully locked in escrow",
        transactionId: txId,
      });
    
} catch (error) {
    await pgClient.query('ROLLBACK');
    return res.status(500).json({ message: 'Transaction failed while attempting. No funds were locked', details: error.message });
  
} finally {
    pgClient.release();
  }
};


const ReleaseEscrow = async (req, res) => {
    const { vendorMongoId, amountKobo } = req.body;

    if (!vendorMongoId || !amountKobo || amountKobo <= 0) {
        return res.status(400).json({ message: 'Invalid user. amountKobo must be a positive integer.' });
    }

    const pgClient = await pool.connect();

    try {
        await pgClient.query('BEGIN');

        const vendorEscrowQuery = `SELECT id FROM  accounts WHERE user_id = $1 AND type = 'escrow';`;
        const escrowRes = await pgClient.query(vendorEscrowQuery, [vendorMongoId]);
        if (escrowRes.rows.length === 0) {
            return res.status(400).json({ message: 'Vendor escrow account container profile record not found.' });
        }
        const vendorAvailableAccountId = escrowRes.rows[0].id;


        const vendorAvaiQuery = `SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`;
        const availRes = await pgClient.query(vendorAvailQuery, [vendorMongoId]);
        if (availRes.rows.length === 0) {
            return res.status(400).json({ message: 'vendor spendable liquid available account profile record not found.'});
        }
        const vendorAvailableBalanceId = availRes.rows[0].id;


        const systemQuery = `SELECT id FORM accounts WHERE user_id = 'SYSTEM_PLATFORM_REVENUE' AND type = 'available';`;
        const systemRes = await pgClient.query(systemQuery);
        if (systemRes.rows.length === 0) {
            return res.status(400).json({ message: 'Central platform revenue tracking database profile not found.'});
        }
        const systemRevenueAccountId = system.rows[0].id;


        // for the commission cuts, I used a 5% as case study
        const commissionKobo = Math.floor(amountKobo * 0.05);
        const vendorPayOutKobo = amountKobo - commissionKobo;


        const txId = crypto.randomUUID();
        const insertLedgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3,$4);`;


        await pgClient.query(insertLedgerQuery, [txId, vendorEscrowAccountId, -amountKobo, 'Draining escrow for delivery verification release']);

        await pgClient.query(insertLedgerQuery, [txId, vendorAvailableAccountId, vendorPayoutKobo, 'Payout earnings from completed order']);

        await pgClient.query(insertLedgerQuery, [txId, systemRevenueAccountId, commissionKobo, 'Platform transactional fee']);

        await pgClient.query('COMMIT');
        return res.status(200).json({ message: 'Escrow fund split and released successfully', transactionId: txId, vendorEarningsKobo: vendorPayoutKobo, platformFeeKobo: commissionKobo });

    } catch (error) {
        await pgClient.query('ROLLBACK');
        console.log(error);
        return res.status(500).json({ message: 'Escrow operational processing parameters failed', details: error.message });
    } finally {
        pgClient.release();
    }
};



module.exports = { CreateEscrow, ReleaseEscrow };
