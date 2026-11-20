const express = require('express');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const { GetProductReviews, CreateReview } = require('../controllers/controller.review');
const router = express.Router();




router.get('/product/:productId', GetProductReviews);
router.post('/', protect, restrictTo('buyer'), CreateReview);


module.exports = router;