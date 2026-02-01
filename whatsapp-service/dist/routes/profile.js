"use strict";
/**
 * Profile Routes - Category 7 (5 endpoints)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.profileRoute = (0, express_1.Router)();
// PATCH /profile/status - Set status message
exports.profileRoute.patch('/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'status is required'
            });
        }
        await (0, whatsapp_1.setStatusMessage)(status);
        res.json({
            success: true,
            message: 'Status updated'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /profile/:jid/picture - Get profile picture
exports.profileRoute.get('/:jid/picture', async (req, res) => {
    try {
        const { jid } = req.params;
        const url = await (0, whatsapp_1.getProfilePicture)(jid);
        if (!url) {
            return res.status(404).json({
                success: false,
                error: 'Profile picture not found'
            });
        }
        res.json({
            success: true,
            url
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /users/info - Get detailed user info
exports.profileRoute.post('/users/info', async (req, res) => {
    try {
        const { jids } = req.body;
        if (!jids || !Array.isArray(jids)) {
            return res.status(400).json({
                success: false,
                error: 'jids array is required'
            });
        }
        const users = await (0, whatsapp_1.getUserInfo)(jids);
        res.json({
            success: true,
            users
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /business/:jid - Get business profile
exports.profileRoute.get('/business/:jid', async (req, res) => {
    try {
        const { jid } = req.params;
        const profile = await (0, whatsapp_1.getBusinessProfile)(jid);
        res.json({
            success: true,
            profile
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
//# sourceMappingURL=profile.js.map