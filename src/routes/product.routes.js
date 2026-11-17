const express = require('express');
const { approvedVendorOnly, protect, restrictTo } = require('../middleware/auth.middleware');
const { EditProduct, GetAllProducts, CreateProduct } = require('../controllers/product.controllers');
const router = express.Router();




router.get('/', GetAllProducts);
router.post('/', protect, restrictTo('vendor'), approvedVendorOnly, CreateProduct);
router.put('/:productId', protect, restrictTo('vendor'), approvedVendorOnly, EditProduct);


module.exports = router;