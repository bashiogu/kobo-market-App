const express = require("express");
const mongoose = require("mongoose");
const { Pool } = require("pg");
const connectDB = require("./config/db");

require("dotenv").config();

const app = express();
const userRoutes = require("./routes/user.routes");

const PORT = process.env.PORT || 8000;

app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.send("Hello People");
});

app.use("/api/v1/user", userRoutes);

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
