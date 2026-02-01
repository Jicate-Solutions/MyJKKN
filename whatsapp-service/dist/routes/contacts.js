"use strict";
/**
 * Contacts Routes - Part of Category 2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactsRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.contactsRoute = (0, express_1.Router)();
// GET /contacts/search - Search contacts
exports.contactsRoute.get('/search', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query parameter is required'
            });
        }
        const contacts = await (0, whatsapp_1.searchContacts)(query);
        res.json({
            success: true,
            contacts,
            count: contacts.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /contacts/:jid/chats - Get all chats involving contact
exports.contactsRoute.get('/:jid/chats', async (req, res) => {
    try {
        const { jid } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 0;
        const chats = await (0, whatsapp_1.getContactChats)(jid, limit, page);
        res.json({
            success: true,
            chats,
            count: chats.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /contacts/:jid/last - Get last interaction
exports.contactsRoute.get('/:jid/last', async (req, res) => {
    try {
        const { jid } = req.params;
        const message = await (0, whatsapp_1.getLastInteraction)(jid);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'No messages found'
            });
        }
        res.json({
            success: true,
            message
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
//# sourceMappingURL=contacts.js.map