const express = require('express');
const { GetWalletSummary, CashOut, FundWallet } = require('../controllers/wallet.controllers');
const { protect, restrictTo, approvedVendorOnly } = require('../middleware/auth.middleware');
const { InitializePaystackPayment, PaystackWebhook } = require('../controllers/paystack.controller');

const router = express.Router();



router.get('/summary', protect, GetWalletSummary);
router.post('/fund', protect, restrictTo('buyer'), FundWallet);
router.post('/cashOut', protect, restrictTo('vendor'), approvedVendorOnly, CashOut);

router.post('/paystack/initialize', protect, restrictTo('buyer'), InitializePaystackPayment);
router.post('/paystack/webhook', PaystackWebhook);



module.exports = router;