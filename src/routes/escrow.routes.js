const express = require('express');
const { CreateEscrow, ReleaseEscrow } = require('../controllers/escrow.controllers');
const router = express.Router();


router.post('/hold', CreateEscrow);
router.post('/release', ReleaseEscrow);



module.exports = router;