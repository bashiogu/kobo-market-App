const express = require('express');
const { restrictTo, protect } = require('../middleware/auth.middleware');
const { ConfirmDelivery, Checkout } = require('../controllers/order.controllers');
const router = express.Router();



router.post('/checkout', protect, restrictTo('buyer'), Checkout);
router.post('/:orderId/confirm-delivery', protect, restrictTo('buyer'), ConfirmDelivery);



module.exports = router;