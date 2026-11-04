const express = require('express');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 8000;

app.use(express.json());

connectDB();



app.get('/', (req, res) => {
    res.send('Hello People');
});



app.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
});