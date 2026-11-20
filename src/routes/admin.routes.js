const express = require('express');
const { ManageVendorStatus, ToggleFreezeUser, OpenDispute, ResolveDispute } = require('../controllers/admin.controllers');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const router = express.Router();





router.post('/dispute/open', protect, restrictTo('buyer', 'vendor'), OpenDispute);
router.patch('/vendors/:vendorId/status', protect, restrictTo('admin'), ManageVendorStatus);
router.patch('/users/:userId/freeze', protect, restrictTo('admin'), ToggleFreezeUser);
router.post('/disputes/:disputeId/freeze', protect, restrictTo('admin'), ResolveDispute)

module.exports = router;