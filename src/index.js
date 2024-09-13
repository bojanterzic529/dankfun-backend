require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const routes = require('./routes');
const { init_TelegramBot } = require('./telegram');
const { Advertised } = require('../models/model');
const mongoString = process.env.DATABASE_URL;

mongoose.connect(mongoString);
const database = mongoose.connection;

database.on('error', (error) => {
    console.log(error)
})

database.once('connected', () => {
    console.log('Database Connected');
})
const app = express();
app.use(cors())
app.use(express.json());


const port = process.env.PORT || 8000
app.use('/api', routes)

app.listen(port, () => {
    console.log(`Server Started at ${port}`)
})

if(process.env.ENABLE_BOT == "true") {
    console.log('initializing bot....')
    init_TelegramBot();
    init_TelegramBot(true);
}