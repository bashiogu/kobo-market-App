const express = require('express');
const { GetWalletSummary } = require('../controllers/wallet.controllers');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();



router.get('/summary', protect, GetWalletSummary);

module.exports = router;