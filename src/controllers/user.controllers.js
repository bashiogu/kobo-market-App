const pool = require("../config/pg");
const User = require("../models/user.models");
const crypto = require("crypto");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const sendEmail = require("../helpers/email");



const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});


const Register = async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  if (!firstName || !lastName || !email || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }

const pgClient = await pool.connect();

try {
    await pgClient.query('BEGIN');

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        await pgClient.query('ROLLBACK');
        return res.status(400).json({ message: 'User already exists.'});
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = new User({
        firstName, lastName, email, password: hashedPassword, role, isEmailVerified: false, emailVerificationToken: verificationToken, emailVerificationExpires: Date.now() + 3600000
    });
    const createdUser = await user.save();

    const idStr = createdUser._id.toString();

    const availRes = await pgClient.query(`INSERT INTO accounts (user_id, type) VALUES ($1, $2) RETURNING id;`, [idStr, 'available']);
    const escrowRes = await pgClient.query(`INSERT INTO accounts (user_id, type) VALUES ($1, $2) RETURNING id;`, [idStr, 'escrow']);

    const txId = crypto.randomUUID();
    const ledgerQuery =`INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;
    await pgClient.query(ledgerQuery, [txId, availRes.rows[0].id, 0, 'Account opened at zero balance']);
    await pgClient.query(ledgerQuery,[txId, escrowRes.rows[0].id, 0, 'Escrow tracker opened at zero balance']);

    await sendEmail(
      email,
      "Account verification",
      `Your verification token is: ${verificationToken}`
    );

    await pgClient.query('COMMIT');
    return res.status(201).json({ message: 'Registration successful. Please check your email for verification token if not verified'});

} catch (error) {
    await pgClient.query('ROLLBACK');
    if(error && error.code !== 11000) {
        await User.deleteOne({ email });
    }
    return res.status(500).json({ message: 'Registration error', details: error.message });
} finally {
    pgClient.release();
}
};


const Signin = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.'});
    }

    try {
    const user = await User.findOne({ email });
    if (!user) {
        return res.status(401).json({ message: 'Invalid account.'});
    }
    if (user.isFrozen) {
        return res.status(403).json({ message: 'This user account has been frozen.'});
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
        return res.status(401).json({ message: 'Invalid credentials'});
    }

    if (!user.isEmailVerified) {
        const newVerificationToken = crypto.randomBytes(32).toString('hex');
        user.emailVerificationToken = newVerificationToken;
        user.emailVerificationExpires = Date.now() + 3600000;
        await user.save();

       await sendEmail(
        email,
        "Account verification",
        `Your verification token is: ${verificationToken}`
       );
        return res.status(403).json({ message: 'Email not verified. Verification token sent to your email.'});
    }


    const token = jwt.sign(
        { userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'fallback_secret_key', { expiresIn: '24h' }
    );
    return res.status(200).json({ message: 'Signed in successfully', token, role: user.role });
} catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Sign-in failed', details: error.message });
}
};

// This is to remind me of how the logic is going. Signin generates a jwt secret as token and sends it to the users mail if account is not verified.
// VerifyEmail, User uses that token as "req.body" to verify the account.


const VerifyEmail = async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ message: 'Verification token is required.'});
    }

    try {
        const user = await User.findOne({
            emailVerificationToken: token, emailVerificationExpires: { $gt: Date.now() }
        });
        if (!user) {
            return res.status(400).json({ message: 'Token invalid or is expired' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save();

        return res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Email verification failed', details: error.message});
    }
};

module.exports = { Register, Signin, VerifyEmail };







// i need verify email, signing, select order, make payment, consent to have received item