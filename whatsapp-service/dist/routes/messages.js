"use strict";
/**
 * Messages Routes - 10 endpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.messagesRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.messagesRoute = (0, express_1.Router)();
// POST /messages/send - Send text message
exports.messagesRoute.post('/send', async (req, res) => {
    try {
        const { recipient, message, reply_to, reply_to_sender } = req.body;
        if (!recipient || !message) {
            return res.status(400).json({
                success: false,
                error: 'recipient and message are required'
            });
        }
        const result = await (0, whatsapp_1.sendMessage)(recipient, message, {
            replyTo: reply_to,
            replyToSender: reply_to_sender
        });
        res.json({
            success: true,
            messageId: result.id._serialized,
            timestamp: result.timestamp
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /messages/send-file - Send file
exports.messagesRoute.post('/send-file', async (req, res) => {
    try {
        const { recipient, media_path } = req.body;
        if (!recipient || !media_path) {
            return res.status(400).json({
                success: false,
                error: 'recipient and media_path are required'
            });
        }
        const result = await (0, whatsapp_1.sendFile)(recipient, media_path);
        res.json({
            success: true,
            messageId: result.id._serialized
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /messages/send-audio - Send audio as voice message
exports.messagesRoute.post('/send-audio', async (req, res) => {
    try {
        const { recipient, media_path } = req.body;
        if (!recipient || !media_path) {
            return res.status(400).json({
                success: false,
                error: 'recipient and media_path are required'
            });
        }
        const result = await (0, whatsapp_1.sendAudioMessage)(recipient, media_path);
        res.json({
            success: true,
            messageId: result.id._serialized
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /messages/send-bulk - Send bulk messages
exports.messagesRoute.post('/send-bulk', async (req, res) => {
    try {
        const { recipients, delay_ms } = req.body;
        if (!recipients || !Array.isArray(recipients)) {
            return res.status(400).json({
                success: false,
                error: 'recipients array is required'
            });
        }
        const results = await (0, whatsapp_1.sendBulkMessages)(recipients, delay_ms || 1500);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        res.json({
            success: true,
            summary: { total: recipients.length, successful, failed },
            results
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /messages - List messages with filters
exports.messagesRoute.get('/', async (req, res) => {
    try {
        const filter = {
            after: req.query.after,
            before: req.query.before,
            senderPhone: req.query.sender_phone_number,
            chatJid: req.query.chat_jid,
            query: req.query.query,
            limit: parseInt(req.query.limit) || 20,
            page: parseInt(req.query.page) || 0,
            includeContext: req.query.include_context !== 'false',
            contextBefore: parseInt(req.query.context_before) || 1,
            contextAfter: parseInt(req.query.context_after) || 1
        };
        const result = await (0, whatsapp_1.listMessages)(filter);
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
// GET /messages/:id/context - Get message context
exports.messagesRoute.get('/:id/context', async (req, res) => {
    try {
        const { id } = req.params;
        const chatJid = req.query.chat_jid;
        const before = parseInt(req.query.before) || 5;
        const after = parseInt(req.query.after) || 5;
        if (!chatJid) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid query parameter is required'
            });
        }
        const messages = await (0, whatsapp_1.getMessageContext)(id, chatJid, before, after);
        res.json({
            success: true,
            messages,
            count: messages.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /messages/forward - Forward message
exports.messagesRoute.post('/forward', async (req, res) => {
    try {
        const { source_chat_jid, message_id, target_chat_jid } = req.body;
        if (!source_chat_jid || !message_id || !target_chat_jid) {
            return res.status(400).json({
                success: false,
                error: 'source_chat_jid, message_id, and target_chat_jid are required'
            });
        }
        const result = await (0, whatsapp_1.forwardMessage)(source_chat_jid, message_id, target_chat_jid);
        res.json({
            success: true,
            forwarded: true,
            originalMessageId: message_id
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// PATCH /messages/:id - Edit message
exports.messagesRoute.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { chat_jid, new_content } = req.body;
        if (!chat_jid || !new_content) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid and new_content are required'
            });
        }
        await (0, whatsapp_1.editMessage)(chat_jid, id, new_content);
        res.json({
            success: true,
            message: 'Message edited'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /messages/:id - Delete message
exports.messagesRoute.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { chat_jid, for_everyone } = req.body;
        if (!chat_jid) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid is required'
            });
        }
        await (0, whatsapp_1.deleteMessage)(chat_jid, id, for_everyone !== false);
        res.json({
            success: true,
            message: 'Message deleted'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /messages/:id/reaction - Add reaction
exports.messagesRoute.post('/:id/reaction', async (req, res) => {
    try {
        const { id } = req.params;
        const { chat_jid, reaction, sender } = req.body;
        if (!chat_jid || reaction === undefined) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid and reaction are required'
            });
        }
        await (0, whatsapp_1.sendReaction)(chat_jid, id, reaction, sender);
        res.json({
            success: true,
            message: reaction ? 'Reaction added' : 'Reaction removed'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /messages/:id/media - Download media
exports.messagesRoute.get('/:id/media', async (req, res) => {
    try {
        const { id } = req.params;
        const chatJid = req.query.chat_jid;
        if (!chatJid) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid query parameter is required'
            });
        }
        const result = await (0, whatsapp_1.downloadMedia)(id, chatJid);
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
//# sourceMappingURL=messages.js.map