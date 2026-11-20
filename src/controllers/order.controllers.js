const Cart = require('../models/cart.models');
const pool = require('../config/pg');

const crypto = require('crypto');


const Checkout = async (req, res) => {
    const buyerId = req.user._id.toString();

    try {
        const cart = await Cart.findOne({ buyerId: req.user._id })
            .populate('items.productId');
            if (!cart || cart.items.length === 0) {
                return res.status(400).json({ message: 'Your cart is empty.' });
            }

            let totalOrderKobo = 0;
            for (const item of cart.items) {
                const product = item.productId;
                if (!product || !product.isActive) {
                    return res.status(400).json({ message: 'One or more items in your cart are nolonger available.' });
                }

                if (product.stock < item.quantity) {
                    return res.status(400).json({ message: 'Insufficient stock for ${product.title}.' });
                }

                const pgClient = await pool.connect();

                try {
                    await pgClient.query('BEGIN');

                    const buyerAccRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`, [buyerId]);
                    if (buyerAccRes.rows.length === 0) throw new Error("Buyer available account not found.");
                    const buyerAccountId = buyerAccRes.rows.id;

                    const balanceRes = await pgClient.query(`SELECT COALESCE(SUM(amount_kobo), 0) AS balance FROM ledger_entries WHERE account_id = $1;`, [buyerAccountId]);
                    const currentBalance = parseInt(balanceRes.rows.balance);

                    if (currentBalance < totalOrderKobo) {
                        await pgClient.query('ROLLBACK');
                        return res.status(400).json({ message: 'Insufficient wallet balance to complete checkout.' });
                    }

                    const createdOrders = [];

                    for (const item of cart.items) {
                        const product = item.productId;
                        const vendorId = product.vendorId.toString();
                        const itemAmountKobo = product.priceKobo * item.quantity;

                        const vendorEscrowRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'escrow';`, [vendorId]);
                        if (vendorEscrowRes.rows.length === 0) throw new Error("Vendor escrow account not found.");
                        const vendorEscrowAccountId = vendorEscrowRes.rows.id;

                        const txId = crypto.randomUUID();
                        const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;
                        const desc = `Order escrow hold for ${product.title} (x${item.quantity})`;

                        await pgClient.query(ledgerQuery, [txId, buyerAccountId, -itemAmountKobo, desc]);
                        await pgClient.query(ledgerQuery, [txId, vendorEscrowAccountId, itemAmountKobo, desc]);

                        const orderQuery = `INSERT INTO orders (buyer_id, vendor_id, product_id, quantity, amount_kobo, status, escrow_tx_id) VALUES ($1, $2, $3, $4, $5, 'in_escrow', $6) RETURNING *;`;
                        const orderRes = await pgClient.query(orderQuery, [buyerId, vendorId, product._id.toString(), item.quantity, itemAmountKobo, txId]);
                        createdOrders.push(orderRes.rows);

                        product.stock -= item.quantity;
                        await product.save();
                    }

                    cart.items = [];
                    await cart.save();

                    await pgClient.query('COMMIT');
                    return res.status(201).json({ message: 'Checkout successful. Funds locked in escrow.', orders: createdOrders });

                } catch (pgError) {
                    await pgClient.query('ROLLBACK');
                    throw pgError;
                } finally {
                    pgClient.release();
                }
            }
    } catch (error) {
        return res.status(500).json({ message: 'Checkout failed', details: error.message });
    }
};


const ConfirmDelivery = async (req, res) => {
    const { orderId } = req.params;
    const buyerId = req.user._id.toString();

    const pgClient = await pool.connect();

    try {
        await pgClient.query('BEGIN');

        const orderRes = await pgClient.query(`SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE;`, [orderId, buyerId]);
        if (orderRes.rows.length === 0) {
            await pgClient.query('ROLLBACK');
            return res.status(400).json({ message: 'Order not found.' });
        }

        const order = orderRes.rows;
        if (order.status !== 'in_escrow') {
            await pgClient.query('ROLLBACK');
            return res.status(400).json({ message: `Cannot confirm delivery. Order status is currently '${order.status}'.` });
        }

        const vendorEscrowRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'escrow';`, [order.vendor_id]);
        const vendorAvailRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = $1 AND type = 'available';`, [order.vendor_id]);
        const systemRes = await pgClient.query(`SELECT id FROM accounts WHERE user_id = 'SYSTEM_PLATFORM_REVENUE' AND type = 'available';`);

        if (vendorEscrowRes.rows.length === 0 || vendorAvailRes.rows.length === 0 || systemRes.rows.length === 0) {
            throw new Error("Required ledger accounts for release not found.");
        }

        const commissionKobo = Math.floor(order.amount_kobo * 0.05);
        const vendorPayoutKobo = order.amount_kobo - commissionKobo;
        const releaseTxId = crypto.randomUUID();
        const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`
        
        await pgClient.query(ledgerQuery, [releaseTxId, vendorEscrowRes.rows.id, -order.amount_kobo, `Order #${order.id} escrow released`]);
        await pgClient.query(ledgerQuery, [releaseTxId, vendorAvailRes.rows.id, vendorPayoutKobo, `Order #${order.id} vendor payout`]);
        await pgClient.query(ledgerQuery, [releaseTxId, systemRes.rows.id, commissionKobo, `Order #${order.id} platform 5% commission`]);

        await pgClient.query(`UPDATE orders SET status = 'delivered', release_tx_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`, [releaseTxId, order.id]);

        await pgClient.query('COMMIT');
        return res.status(200).json({ message: "Delivery confirmed and escrow released to vendor.", releaseTxId, vendorPayoutKobo, commissionKobo });
    } catch (error) {
        await pgClient.query('ROLLBACK');
        return res.status(500).json({ error: "Failed to confirm delivery", details: error.message });
    } finally {
        pgClient.release();
    }
};



module.exports = { Checkout, ConfirmDelivery };