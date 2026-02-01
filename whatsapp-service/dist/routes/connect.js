"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.connectRoute = (0, express_1.Router)();
exports.connectRoute.post('/', async (req, res) => {
    try {
        const currentState = (0, whatsapp_1.getState)();
        if (currentState === 'ready') {
            return res.json({
                success: true,
                state: 'ready',
                message: 'Already connected'
            });
        }
        // Start initialization (non-blocking)
        (0, whatsapp_1.initializeClient)().catch(err => {
            console.error('[Connect] Init error:', err.message);
        });
        // Return current state
        res.json({
            success: true,
            state: (0, whatsapp_1.getState)(),
            message: 'Connection initiated. Poll /status for QR code.'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
//# sourceMappingURL=connect.js.map