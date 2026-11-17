const express = require('express');
const { GetWalletSummary, CashOut, FundWallet } = require('../controllers/wallet.controllers');
const { protect, restrictTo, approvedVendorOnly } = require('../middleware/auth.middleware');

const router = express.Router();



router.get('/summary', protect, GetWalletSummary);
router.post('/fund', protect, restrictTo('buyer'), FundWallet);
router.post('/cashOut', protect, restrictTo('vendor'), approvedVendorOnly, CashOut);



module.exports = router;