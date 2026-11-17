const express = require('express');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const { GetCart, AddToCart, RemoveFromCart } = require('../controllers/cart.controllers');
const router = express.Router();




router.get('/', protect, restrictTo('buyer'), GetCart);
router.post('/add', protect, restrictTo('buyer'), AddToCart);
router.delete('/remove/:productId', protect, restrictTo('buyer'), RemoveFromCart);


module.exports = router;