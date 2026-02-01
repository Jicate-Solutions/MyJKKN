"use strict";
/**
 * Send Route - Send single WhatsApp message
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendRouter = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
const router = (0, express_1.Router)();
exports.sendRouter = router;
/**
 * POST /send
 * Send a message to a phone number or group
 */
router.post('/', async (req, res) => {
    try {
        const { phone, phoneNumber, groupId, message } = req.body;
        const recipient = phone || phoneNumber;
        // Validate request
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }
        if (!recipient && !groupId) {
            return res.status(400).json({
                success: false,
                error: 'Either phone/phoneNumber or groupId is required'
            });
        }
        // Check if connected
        if (!(0, whatsapp_1.isReady)()) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected. Please connect first.'
            });
        }
        // Send to group or individual
        let result;
        if (groupId) {
            console.log(`[Send] Sending to group: ${groupId}`);
            result = await (0, whatsapp_1.sendGroupMessage)(groupId, message);
        }
        else {
            console.log(`[Send] Sending to: ${recipient}`);
            result = await (0, whatsapp_1.sendMessage)(recipient, message);
        }
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Send] Error:', errorMsg);
        res.status(500).json({
            success: false,
            error: errorMsg
        });
    }
});
//# sourceMappingURL=send.js.map