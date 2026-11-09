const pool = require("../config/pg");
const User = require("../models/user.models");

const crypto = require("crypto");

const Register = async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  if (!firstName || !lastName || !email || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }
  try {
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }
  } catch (mongoError) {
    console.error("MongoDB lookup error:", mongoError);
    return res.status(500).json({ message: "Registration failed" });
  }

  const pgClient = await pool.connect();
  let createdUser = null;

  try {
    await pgClient.query("BEGIN");

    createdUser = new User({ firstName, lastName, email, password, role });
    await createdUser.save();

    const idString = createdUser._id.toString();

    const insertAvailableQuery = `INSERT INTO accounts (user_id, type) VALUES ($1, $2) RETURNING id;`;
    const availRes = await pgClient.query(insertAvailableQuery, [
      idString,
      "available",
    ]);
    const availableAccountId = availRes.rows[0].id;

    const insertEscrowQuery = `INSERT INTO accounts (user_id,type) VALUES ($1, $2) RETURNING id;`;
    const escrowRes = await pgClient.query(insertEscrowQuery, [
      idString,
      "escrow",
    ]);
    const escrowAccountId = escrowRes.rows[0].id;

    const txId = crypto.randomUUID();
    const ledgerQuery = `INSERT INTO ledger_entries (transaction_id, account_id, amount_kobo, description) VALUES ($1, $2, $3, $4);`;

    await pgClient.query(ledgerQuery, [
      txId,
      availableAccountId,
      0,
      "Account opened at zero balance",
    ]);
    await pgClient.query(ledgerQuery, [
      txId,
      escrowAccountId,
      0,
      "Escrow tracker opened at zero balance",
    ]);

    await pgClient.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Registration successful", userId: createdUser._id });
  } catch (error) {
    await pgClient.query("ROLLBACK");

    if (createdUser && createdUser._id) {
      await User.deleteOne({ _id: createdUser._id });
    }
    console.log(error);
    return res
      .status(500)
      .json({ message: "Registration failed", details: error.message });
  } finally {
    pgClient.release();
  }
};

module.exports = { Register };
