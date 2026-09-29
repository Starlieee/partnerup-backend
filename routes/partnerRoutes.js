const express = require("express");
const router = express.Router();
const partnerController = require("../controllers/partnerController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/search", authMiddleware, partnerController.searchByInterest);
router.get("/", authMiddleware, partnerController.getPartners);

module.exports = router;