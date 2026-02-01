"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.disconnectRoute = (0, express_1.Router)();
exports.disconnectRoute.post('/', async (req, res) => {
    try {
        if ((0, whatsapp_1.getState)() === 'disconnected') {
            return res.json({
                success: true,
                message: 'Already disconnected'
            });
        }
        await (0, whatsapp_1.disconnect)();
        res.json({
            success: true,
            message: 'Disconnected successfully'
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
//# sourceMappingURL=disconnect.js.map