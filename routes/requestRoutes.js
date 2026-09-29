const express = require("express");
const router = express.Router();
const requestController = require("../controllers/requestController");
const authMiddleware = require("../middleware/authMiddleware");

// Endpoint Notifikasi Lonceng (Diletakkan sebelum rute berparameter /:id)
router.get("/notifications", authMiddleware, requestController.getNotifications);
router.put("/notifications/read-all", authMiddleware, requestController.markAllNotificationsRead);

router.post("/", authMiddleware, requestController.sendRequest);
router.get("/", authMiddleware, requestController.getRequests);
router.put("/:id/accept", authMiddleware, requestController.acceptRequest);
router.put("/:id/reject", authMiddleware, requestController.rejectRequest);

// Endpoint Private Chat Berbasis Database
router.get("/:id/messages", authMiddleware, requestController.getMessages);
router.post("/:id/messages", authMiddleware, requestController.sendMessage);
router.put("/:id/messages/read", authMiddleware, requestController.markAsRead);

module.exports = router;