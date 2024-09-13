require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const routes = require('./routes');
const { init_TelegramBot } = require('./telegram');
const { Advertised, StatusData } = require('../models/model');
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
let triggerRefreshMonitoring;
let triggerRefreshMonitoringTestnet;
if (process.env.ENABLE_BOT == "true") {
    console.log('initializing bot....')
    triggerRefreshMonitoring = init_TelegramBot();
    triggerRefreshMonitoringTestnet = init_TelegramBot(true);
}
router.get("/refreshMonitoring", async (req, res) => {
    let lastRefreshTime = await StatusData.findOne({ key: 'lastRefreshTime' });
    if (lastRefreshTime?.value == undefined) {
        await StatusData.create({ key: 'lastRefreshTime', value: Date.now() });
        triggerRefreshMonitoring();
        triggerRefreshMonitoringTestnet();

    }
    else {
        if (Date.now() > lastRefreshTime.value + 100000) {
            triggerRefreshMonitoring();
            triggerRefreshMonitoringTestnet();
        }
        lastRefreshTime.value = Date.now();
        await lastRefreshTime.save();
    }
    res.send('ok');
})

app.use('/api/private', router);