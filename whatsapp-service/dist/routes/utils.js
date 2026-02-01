"use strict";
/**
 * Utility Routes - Category 8 (2 endpoints)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.utilsRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.utilsRoute = (0, express_1.Router)();
// POST /typing - Send typing indicator
exports.utilsRoute.post('/typing', async (req, res) => {
    try {
        const { chat_jid, typing } = req.body;
        if (!chat_jid) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid is required'
            });
        }
        await (0, whatsapp_1.sendTypingIndicator)(chat_jid, typing !== false);
        res.json({
            success: true,
            message: typing !== false ? 'Typing indicator shown' : 'Typing indicator cleared'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /check - Check if numbers are on WhatsApp
exports.utilsRoute.post('/check', async (req, res) => {
    try {
        const { phone_numbers } = req.body;
        if (!phone_numbers || !Array.isArray(phone_numbers)) {
            return res.status(400).json({
                success: false,
                error: 'phone_numbers array is required'
            });
        }
        const results = await (0, whatsapp_1.isOnWhatsApp)(phone_numbers);
        const registered = results.filter(r => r.isRegistered).length;
        res.json({
            success: true,
            summary: {
                total: phone_numbers.length,
                registered,
                notRegistered: phone_numbers.length - registered
            },
            results
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
//# sourceMappingURL=utils.js.map