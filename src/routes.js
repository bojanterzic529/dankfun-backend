const express = require("express");
const path = require("path");
const multer = require('multer');
const { Data, profileData, historyData, Advertised, StatusData } = require("../models/model");
const { controller } = require("./controller");
const { triggerRefreshMonitoring, triggerRefreshMonitoringTestnet } = require(".");
const router = express.Router();

router.use((req, res, next) => {
    res.header("X-Frame-Options", "DENY");
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

//add chat content
router.post("/add", controller.add);

router.post("/addprofile", controller.addProfile);

// add purcahse history
router.post("/addHistory", controller.addHistory);

//Get by dank address
router.get("/getOne/:DankAddress", async (req, res) => {
    try {
        const data = await Data.find({
            DankAddress: req.params.DankAddress,
        }).sort({ timestamp: -1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get("/getAdvertised", async (req, res) => {
    try {
        const left = await Advertised.find({ type: 'left' });
        if (left.length == 0) await Advertised.create({ type: "left", address: '' })
        const center = await Advertised.find({ type: 'center' });
        if (center.length == 0) await Advertised.create({ type: "center", address: '' })
        const right = await Advertised.find({ type: 'right' });
        if (right.length == 0) await Advertised.create({ type: "right", address: '' })
        res.json([left[0]?.address, center[0]?.address, right[0]?.address]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
})

router.get("/getProfile/:profileAddress", async (req, res) => {
    try {
        const data = await profileData.find({
            profileAddress: req.params.profileAddress,
        });
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get("/getHistory", async (req, res) => {
    try {
        const data = await historyData.find().sort({ timestamp: -1 }).limit(5);
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get("/getUserHistory/:profileAddress", async (req, res) => {
    try {
        const data = await historyData.find({ buyer: req.params.profileAddress });
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


router.get('/uploads/:name', (req, res) => {
    res.sendFile(path.join(__dirname, "./uploads/", req.params.name))
});

const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "src/uploads/")
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname + "-" + 'logo' + ".png")
    },
})
const logoUpload = multer({ storage: logoStorage });
router.post('/logoUploads', logoUpload.single('file'), (req, res) => {
    if (req.file) {
        console.log('File uploaded successfully', req.file)
        return res.status(200).json({ fileInfo: req.file });
    } else {
        res.status(400).json({ message: 'No file was uploaded.' });
        console.log('No file was uploaded.', req.file)
    }
});

const bannerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "src/uploads/")
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname + "-" + 'banner' + ".png")
    },
})
const bannerUpload = multer({ storage: bannerStorage });
router.post('/bannerUploads', bannerUpload.single('file'), (req, res) => {
    if (req.file) {
        console.log('File uploaded successfully', req.file)
        return res.status(200).json({ fileInfo: req.file });
    } else {
        res.status(400).json({ message: 'No file was uploaded.' });
        console.log('No file was uploaded.', req.file)
    }
});


const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "src/uploads/")
    },
    filename: (req, file, cb) => {
        cb(null, 'profile' + "-" + file.originalname + '.png')
    },
})
const profileUpload = multer({ storage: profileStorage });
router.post('/profileUploads', profileUpload.single('file'), (req, res) => {
    if (req.file) {
        console.log('File uploaded successfully', req.file)
        return res.status(200).json({ fileInfo: req.file });
    } else {
        res.status(400).json({ message: 'No file was uploaded.' });
        console.log('No file was uploaded.', req.file)
    }
});

router.get('/version', (req, res) => {
    res.send('1.3');
    return;
});

module.exports = router;