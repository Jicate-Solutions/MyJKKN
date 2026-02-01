"use strict";
/**
 * Chats Routes - Part of Category 2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatsRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.chatsRoute = (0, express_1.Router)();
// GET /chats - List all chats
exports.chatsRoute.get('/', async (req, res) => {
    try {
        const filter = {
            query: req.query.query,
            limit: parseInt(req.query.limit) || 20,
            page: parseInt(req.query.page) || 0,
            includeLastMessage: req.query.include_last_message !== 'false',
            sortBy: req.query.sort_by || 'last_active'
        };
        const result = await (0, whatsapp_1.listChats)(filter);
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
// GET /chats/by-phone/:phone - Get DM by phone number
exports.chatsRoute.get('/by-phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const chat = await (0, whatsapp_1.getDirectChatByContact)(phone);
        res.json({
            success: true,
            chat
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /chats/:jid - Get specific chat
exports.chatsRoute.get('/:jid', async (req, res) => {
    try {
        const { jid } = req.params;
        const includeLastMessage = req.query.include_last_message !== 'false';
        const chat = await (0, whatsapp_1.getChat)(jid, includeLastMessage);
        res.json({
            success: true,
            chat
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /chats/:jid/read - Mark messages as read
exports.chatsRoute.post('/:jid/read', async (req, res) => {
    try {
        const { jid } = req.params;
        const { message_ids, sender } = req.body;
        if (!message_ids || !Array.isArray(message_ids)) {
            return res.status(400).json({
                success: false,
                error: 'message_ids array is required'
            });
        }
        await (0, whatsapp_1.markRead)(jid, message_ids, sender);
        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
//# sourceMappingURL=chats.js.map