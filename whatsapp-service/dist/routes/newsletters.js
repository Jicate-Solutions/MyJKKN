"use strict";
/**
 * Newsletters Routes - Category 5 (7 endpoints)
 * Note: Newsletter support requires specific whatsapp-web.js version
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.newslettersRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.newslettersRoute = (0, express_1.Router)();
// GET /newsletters - List subscribed newsletters
exports.newslettersRoute.get('/', async (req, res) => {
    try {
        const newsletters = await (0, whatsapp_1.listSubscribedNewsletters)();
        res.json({
            success: true,
            newsletters,
            count: newsletters.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /newsletters - Create newsletter
exports.newslettersRoute.post('/', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'name is required'
            });
        }
        const result = await (0, whatsapp_1.createNewsletter)(name, description);
        res.json({
            success: true,
            newsletter: result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /newsletters/preview - Preview newsletter from link
exports.newslettersRoute.get('/preview', async (req, res) => {
    try {
        const inviteLink = req.query.invite_link;
        if (!inviteLink) {
            return res.status(400).json({
                success: false,
                error: 'invite_link query parameter is required'
            });
        }
        const result = await (0, whatsapp_1.previewNewsletterLink)(inviteLink);
        res.json({
            success: true,
            newsletter: result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /newsletters/:jid - Get newsletter info
exports.newslettersRoute.get('/:jid', async (req, res) => {
    try {
        const { jid } = req.params;
        const newsletter = await (0, whatsapp_1.getNewsletterInfo)(jid);
        res.json({
            success: true,
            newsletter
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /newsletters/:jid/follow - Follow newsletter
exports.newslettersRoute.post('/:jid/follow', async (req, res) => {
    try {
        const { jid } = req.params;
        await (0, whatsapp_1.followNewsletter)(jid);
        res.json({
            success: true,
            message: 'Followed newsletter'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /newsletters/:jid/unfollow - Unfollow newsletter
exports.newslettersRoute.post('/:jid/unfollow', async (req, res) => {
    try {
        const { jid } = req.params;
        await (0, whatsapp_1.unfollowNewsletter)(jid);
        res.json({
            success: true,
            message: 'Unfollowed newsletter'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /newsletters/:jid/react - React to newsletter message
exports.newslettersRoute.post('/:jid/react', async (req, res) => {
    try {
        const { jid } = req.params;
        const { server_id, message_id, reaction } = req.body;
        if (server_id === undefined || !message_id || reaction === undefined) {
            return res.status(400).json({
                success: false,
                error: 'server_id, message_id, and reaction are required'
            });
        }
        await (0, whatsapp_1.reactToNewsletterMessage)(jid, server_id, message_id, reaction);
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
//# sourceMappingURL=newsletters.js.map