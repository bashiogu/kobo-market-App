const express = require('express');
const router = express.Router();


const { CreateEscrow, ReleaseEscrow } = require('../controllers/escrow.controllers');
const { protect } = require('../middleware/auth.middleware');



router.post('/hold', protect, CreateEscrow);
router.post('/release', protect, ReleaseEscrow);



module.exports = router;