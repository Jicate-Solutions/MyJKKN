"use strict";
/**
 * LID Resolution Routes - Category 6 (6 endpoints)
 * LIDs are privacy-preserving identifiers WhatsApp uses instead of phone numbers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lidRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.lidRoute = (0, express_1.Router)();
// GET /lid/resolve - Resolve LID to phone
exports.lidRoute.get('/resolve', async (req, res) => {
    try {
        const lid = req.query.lid;
        if (!lid) {
            return res.status(400).json({
                success: false,
                error: 'lid query parameter is required'
            });
        }
        const result = (0, whatsapp_1.resolveLid)(lid);
        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'LID not found in cache'
            });
        }
        res.json({
            success: true,
            lid,
            ...result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /lid/phone - Resolve phone to LID
exports.lidRoute.get('/phone', async (req, res) => {
    try {
        const phone = req.query.phone;
        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'phone query parameter is required'
            });
        }
        const lid = (0, whatsapp_1.resolvePhoneToLid)(phone);
        if (!lid) {
            return res.status(404).json({
                success: false,
                error: 'Phone number not found in cache'
            });
        }
        res.json({
            success: true,
            phone,
            lid
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /lid/batch - Batch resolve LIDs and phones
exports.lidRoute.post('/batch', async (req, res) => {
    try {
        const { lids, phones } = req.body;
        const result = (0, whatsapp_1.resolveBatchLids)(lids || [], phones || []);
        res.json({
            success: true,
            ...result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /lid/stats - Get LID cache statistics
exports.lidRoute.get('/stats', async (req, res) => {
    try {
        const stats = (0, whatsapp_1.getLidCacheStats)();
        res.json({
            success: true,
            ...stats
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /lid/mappings - List all LID mappings
exports.lidRoute.get('/mappings', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const mappings = (0, whatsapp_1.listLidMappings)(limit);
        res.json({
            success: true,
            mappings,
            count: mappings.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /lid/populate - Populate LID cache from groups
exports.lidRoute.post('/populate', async (req, res) => {
    try {
        const result = await (0, whatsapp_1.populateLidCache)();
        res.json({
            success: true,
            ...result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
//# sourceMappingURL=lid.js.map