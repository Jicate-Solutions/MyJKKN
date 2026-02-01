"use strict";
/**
 * Bulk Route - Send multiple WhatsApp messages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkRouter = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
const router = (0, express_1.Router)();
exports.bulkRouter = router;
/**
 * POST /send-bulk
 * Send messages to multiple recipients
 */
router.post('/', async (req, res) => {
    try {
        const { recipients, delayMs = 1500 } = req.body;
        // Validate request
        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Recipients array is required and must not be empty'
            });
        }
        // Check if connected
        if (!(0, whatsapp_1.isReady)()) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected. Please connect first.'
            });
        }
        // Normalize recipients (support both phone and phoneNumber)
        const normalizedRecipients = recipients.map(r => ({
            phoneNumber: r.phone || r.phoneNumber || '',
            message: r.message
        }));
        // Validate all recipients have phone and message
        const invalidRecipients = normalizedRecipients.filter(r => !r.phoneNumber || !r.message);
        if (invalidRecipients.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Each recipient must have a phone/phoneNumber and message'
            });
        }
        console.log(`[Bulk] Sending to ${recipients.length} recipients`);
        const result = await (0, whatsapp_1.sendBulkMessages)(normalizedRecipients, delayMs);
        console.log(`[Bulk] Completed: ${result.sent}/${result.total} sent`);
        res.json({
            success: result.failed === 0,
            ...result
        });
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Bulk] Error:', errorMsg);
        res.status(500).json({
            success: false,
            error: errorMsg
        });
    }
});
//# sourceMappingURL=bulk.js.map