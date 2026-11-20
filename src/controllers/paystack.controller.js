  const https = require('https');
  const crypto = require('crypto');
  const pool = require('../config/pg');
 
  const InitializePaystackPayment = async (req, res) => {
        const { amountKobo } = req.body;
        const userId = req.user._id.toString();
    const email = req.user.email;

   if (!amountKobo || !Number.isInteger(amountKobo) || amountKobo < 10000) {
     return res.status(400).json({ error: "amountKobo must be a whole integer of at least 10000 (100 Naira)." });
   }

   const payload = JSON.stringify({
     email,
     amount: amountKobo,
     metadata: { userId }
});

   const options = {
     hostname: 'api.paystack.co',
     port: 443,
     path: '/transaction/initialize',
     method: 'POST',
     headers: {
       Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
       'Content-Type': 'application/json',
       'Content-Length': Buffer.byteLength(payload)
     }
   };

   const paystackReq = https.request(options, (paystackRes) => {
     let rawData = '';

     paystackRes.on('data', (chunk) => {
       rawData += chunk;
     });

     paystackRes.on('end', async () => {
       try {
         const parsed = JSON.parse(rawData);
         if (!parsed.status) {
           return res.status(400).json({ error: "Paystack initialization failed", details: parsed.message });
         }

         const { authorization_url, reference } = parsed.data;

         await pool.query(
           `INSERT INTO paystack_transactions (reference, user_id, amount_kobo, status) VALUES ($1, $2, $3, 'pending');`,
           [reference, userId, amountKobo]
         );

         return res.status(200).json({
           message: "Paystack payment initialized",
           authorization_url,
           reference
         });
       } catch (error) {
         return res.status(500).json({ error: "Error saving Paystack transaction", details: error.message });
       }
     });
   });

   paystackReq.on('error', (error) => {
     return res.status(500).json({ error: "Network error reaching Paystack", details: error.message });
   });

   paystackReq.write(payload);
   paystackReq.end();
 };

 const PaystackWebhook = async (req, res) => {
   const hash = crypto     .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
     .update(JSON.stringify(req.body))
    .digest('hex');

   if (hash !== req.headers['x-paystack-signature']) {
     return res.status(401).json({ error: "Invalid Paystack webhook signature." });
   }

   const event = req.body;
   if (event.event !== 'charge.success') {
     return res.sendStatus(200);
   }

   const { reference, amount } = event.data;
   const pgClient = await pool.connect();

   try {
     await pgClient.query('BEGIN');
     const txRes = await pgClient.query(
       `SELECT * FROM paystack_transactions WHERE reference = $1 FOR UPDATE;`,
       [reference]
     );

     if (txRes.rows.length === 0 || txRes.rows[0].status === 'success') {
       await pgClient.query('ROLLBACK');
      return res.sendStatus(200);
    }

    const record = txRes.rows[0];
    if (parseInt(amount) !== record.amount_kobo) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ error: "Amount mismatch detected." });
    }

    const userAccRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`, [record.user_id]);
    const gatewayAccRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = 'SYSTEM_GATEWAY_CLEARING' AND type = 'available';`);

    if (userAccRes.rows.length === 0 || gatewayAccRes.rows.length === 0) {
      throw new Error("Required ledger accounts not found.");
    }

    const ledgerTxId = crypto.randomUUID();
    const desc = `Paystack wallet funding (Ref: ${reference})`;
    const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;

    await pgClient.query(ledgerQuery, [ledgerTxId, gatewayAccRes.rows[0].id, -record.amount_kobo, desc]);
    await pgClient.query(ledgerQuery, [ledgerTxId, userAccRes.rows[0].id, record.amount_kobo, desc]);

    await pgClient.query(
      `UPDATE paystack_transactions SET status = 'success', ledger_tx_id = $1 WHERE id = $2;`,
      [ledgerTxId, record.id]
    );

    await pgClient.query('COMMIT');
    return res.sendStatus(200);
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error("Paystack webhook processing error:", error);
    return res.sendStatus(500);
  } finally {
    pgClient.release();
  }
 };

 module.exports = { InitializePaystackPayment, PaystackWebhook };