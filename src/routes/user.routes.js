const express = require("express");
const {
  Register,
  Signin,
  VerifyEmail,
} = require("../controllers/user.controllers");

const router = express.Router();

router.post("/register", Register);
router.post("/signin", Signin);
router.post("/verify-email", VerifyEmail);

module.exports = router;
