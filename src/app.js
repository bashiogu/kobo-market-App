const express = require("express");
const mongoose = require("mongoose");
const { Pool } = require("pg");
require("dotenv").config();

const connectDB = require("./config/db.js");
connectDB();
require("./config/pg.js");

const app = express();
app.use(express.json());

const userRoutes = require("./routes/user.routes");
const escrowRoutes = require('./routes/escrow.routes.js')




const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.send("Hello People");
});

app.use("/api/v1/user", userRoutes);
app.use('/api/v1/escrow', escrowRoutes);



app.listen(PORT, () => {
  console.log(`server is fully operational on port ${PORT}`);
});


//endpoint to lock fund
// localhost:8000/api/v1/escrow/hold keeping it here for a reminder.
