const express = require('express');
const { Register } = require('../controllers/user.controllers');


const router = express.Router();


router.post('/register', Register);


module.exports = router;