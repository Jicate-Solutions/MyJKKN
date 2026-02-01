"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.statusRoute = (0, express_1.Router)();
exports.statusRoute.get('/', async (req, res) => {
    try {
        const status = await (0, whatsapp_1.getConnectionStatus)();
        res.json({
            success: true,
            state: status.state,
            isLoggedIn: status.isLoggedIn,
            qrCode: (0, whatsapp_1.getQRCode)(),
            clientInfo: status.info
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
//# sourceMappingURL=status.js.map