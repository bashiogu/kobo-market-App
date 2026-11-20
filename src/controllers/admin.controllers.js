const MongoUser = require('../models/user.models');
const pool = require('../config/pg');
const crypto = require('crypto');

const ManageVendorStatus = async (req, res) => {
    const { vendorId } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Status must be either 'approved' or 'rejected'." });
       }

  try { 
    const vendor = await MongoUser.findOne({ _id: vendorId, role: 'vendor' });
    if (!vendor) {
      return res.status(404).json({ error: "Vendor account not found." });
     }

     vendor.vendorStatus = status;
     await vendor.save();

     return res.status(200).json({ message: `Vendor status updated to ${status}`, vendorId: vendor._id, vendorStatus: vendor.vendorStatus });
   } catch (error) {
     return res.status(500).json({ error: "Failed to update vendor status", details: error.message });
   }
 };

 const ToggleFreezeUser = async (req, res) => {
   const { userId } = req.params;
   const { isFrozen } = req.body;

   if (typeof isFrozen !== 'boolean') {
     return res.status(400).json({ error: "isFrozen must be a boolean (true or false)." });
   }

   try {
     const user = await MongoUser.findById(userId);
     if (!user) {
       return res.status(404).json({ error: "User not found." });
     }

     user.isFrozen = isFrozen;
     await user.save();

     return res.status(200).json({ message: `User freeze status set to ${isFrozen}`, userId: user._id, isFrozen: user.isFrozen });
   } catch (error) {
     return res.status(500).json({ error: "Failed to update freeze status", details: error.message });
   }
 };

 const OpenDispute = async (req, res) => {
   const { orderId, reason } = req.body;
   const userId = req.user._id.toString();

   if (!orderId || !reason) {
     return res.status(400).json({ error: "orderId and reason are required." });
   }

   const pgClient = await pool.connect();

   try {
     await pgClient.query('BEGIN');

     const orderRes = await pgClient.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE;`, [orderId]);
     if (orderRes.rows.length === 0) {
       await pgClient.query('ROLLBACK');
       return res.status(404).json({ error: "Order not found." });
     }

     const order = orderRes.rows[0];
     if (order.buyer_id !== userId && order.vendor_id !== userId) {
       await pgClient.query('ROLLBACK');
       return res.status(403).json({ error: "You are not authorized to dispute this order." });
     }

     if (order.status !== 'in_escrow') {
       await pgClient.query('ROLLBACK');
       return res.status(400).json({ error: `Cannot dispute order with status '${order.status}'.` });
     }

     const disputeRes = await pgClient.query(
       `INSERT INTO disputes (order_id, raised_by_id, reason) VALUES ($1, $2, $3) RETURNING *;`,
       [orderId, userId, reason]
     );

     await pgClient.query(`UPDATE orders SET status = 'disputed', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`, [orderId]);

     await pgClient.query('COMMIT');
     return res.status(201).json({ message: "Dispute opened successfully", dispute: disputeRes.rows[0] });
   } catch (error) {
     await pgClient.query('ROLLBACK');
     return res.status(500).json({ error: "Failed to open dispute", details: error.message });
   } finally {
     pgClient.release();
   }
 };

 const ResolveDispute = async (req, res) => {
   const { disputeId } = req.params;
  const { resolution, adminNotes } = req.body;
  const adminId = req.user._id.toString();

  if (!['refund_buyer', 'release_to_vendor'].includes(resolution)) {
    return res.status(400).json({ error: "Resolution must be either 'refund_buyer' or 'release_to_vendor'." });
  }

  const pgClient = await pool.connect();

  try {
    await pgClient.query('BEGIN');

    const disputeRes = await pgClient.query(`SELECT * FROM disputes WHERE id = $1 FOR UPDATE;`, [disputeId]);
    if (disputeRes.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ error: "Dispute not found." });
    }

    const dispute = disputeRes.rows[0];
    if (dispute.status !== 'open') {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ error: "This dispute has already been resolved." });
    }

    const orderRes = await pgClient.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE;`, [dispute.order_id]);
    const order = orderRes.rows[0];

    const vendorEscrowRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'escrow';`, [order.vendor_id]);
    const txId = crypto.randomUUID();
    const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;
    let newOrderStatus = '';

    if (resolution === 'refund_buyer') {
      const buyerAvailRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`, [order.buyer_id]);
      await pgClient.query(ledgerQuery, [txId, vendorEscrowRes.rows[0].id, -order.amount_kobo, `Dispute #${dispute.id} refund drained from escrow`]);
      await pgClient.query(ledgerQuery, [txId, buyerAvailRes.rows[0].id, order.amount_kobo, `Dispute #${dispute.id} refunded to buyer`]);
      newOrderStatus = 'refunded';
    } else {
      const vendorAvailRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`, [order.vendor_id]);
      const systemRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = 'SYSTEM_PLATFORM_REVENUE' AND type = 'available';`);
      const commissionKobo = Math.floor(order.amount_kobo * 0.05);
      const vendorPayoutKobo = order.amount_kobo - commissionKobo;

      await pgClient.query(ledgerQuery, [txId, vendorEscrowRes.rows[0].id, -order.amount_kobo, `Dispute #${dispute.id} released from escrow`]);
      await pgClient.query(ledgerQuery, [txId, vendorAvailRes.rows[0].id, vendorPayoutKobo, `Dispute #${dispute.id} payout to vendor`]);
      await pgClient.query(ledgerQuery, [txId, systemRes.rows[0].id, commissionKobo, `Dispute #${dispute.id} platform 5% commission`]);
      newOrderStatus = 'delivered';
    }

    await pgClient.query(`UPDATE orders SET status = $1, release_tx_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;`, [newOrderStatus, txId, order.id]);
    await pgClient.query(
      `UPDATE disputes SET status = 'resolved', resolution = $1, admin_notes = $2, resolved_by_admin_id = $3, resolution_tx_id = $4, resolved_at = CURRENT_TIMESTAMP WHERE id = $5;`,
      [resolution, adminNotes || '', adminId, txId, dispute.id]
    );

    await pgClient.query('COMMIT');
    return res.status(200).json({ message: `Dispute resolved with ruling: ${resolution}`, transactionId: txId, orderStatus: newOrderStatus });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    return res.status(500).json({ error: "Failed to resolve dispute", details: error.message });
  } finally {
    pgClient.release();
  }
 };
module.exports = { ManageVendorStatus, ToggleFreezeUser, OpenDispute, ResolveDispute };