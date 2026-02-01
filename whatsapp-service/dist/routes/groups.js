"use strict";
/**
 * Groups Routes - Category 3 & 4 (17 endpoints)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupsRoute = void 0;
const express_1 = require("express");
const whatsapp_1 = require("../whatsapp");
exports.groupsRoute = (0, express_1.Router)();
// GET /groups - Get all joined groups
exports.groupsRoute.get('/', async (req, res) => {
    try {
        const groups = await (0, whatsapp_1.getJoinedGroups)();
        res.json({
            success: true,
            groups,
            count: groups.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /groups - Create new group
exports.groupsRoute.post('/', async (req, res) => {
    try {
        const { name, participants } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'name is required'
            });
        }
        const result = await (0, whatsapp_1.createGroup)(name, participants || []);
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
// POST /groups/join - Join group via invite link
exports.groupsRoute.post('/join', async (req, res) => {
    try {
        const { invite_link } = req.body;
        if (!invite_link) {
            return res.status(400).json({
                success: false,
                error: 'invite_link is required'
            });
        }
        const result = await (0, whatsapp_1.joinGroupWithLink)(invite_link);
        res.json({
            success: true,
            groupId: result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /groups/preview - Preview group from link
exports.groupsRoute.get('/preview', async (req, res) => {
    try {
        const inviteLink = req.query.invite_link;
        if (!inviteLink) {
            return res.status(400).json({
                success: false,
                error: 'invite_link query parameter is required'
            });
        }
        const result = await (0, whatsapp_1.previewGroupLink)(inviteLink);
        res.json({
            success: true,
            group: result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /groups/:jid/participants - Get group participants
exports.groupsRoute.get('/:jid/participants', async (req, res) => {
    try {
        const { jid } = req.params;
        const participants = await (0, whatsapp_1.getGroupParticipants)(jid);
        res.json({
            success: true,
            participants,
            count: participants.length
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /groups/:jid/leave - Leave group
exports.groupsRoute.post('/:jid/leave', async (req, res) => {
    try {
        const { jid } = req.params;
        await (0, whatsapp_1.leaveGroup)(jid);
        res.json({
            success: true,
            message: 'Left group successfully'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// PATCH /groups/:jid/name - Set group name
exports.groupsRoute.patch('/:jid/name', async (req, res) => {
    try {
        const { jid } = req.params;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'name is required'
            });
        }
        await (0, whatsapp_1.setGroupName)(jid, name);
        res.json({
            success: true,
            message: 'Group name updated'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// PATCH /groups/:jid/description - Set group description
exports.groupsRoute.patch('/:jid/description', async (req, res) => {
    try {
        const { jid } = req.params;
        const { description } = req.body;
        if (description === undefined) {
            return res.status(400).json({
                success: false,
                error: 'description is required'
            });
        }
        await (0, whatsapp_1.setGroupDescription)(jid, description);
        res.json({
            success: true,
            message: 'Group description updated'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// PATCH /groups/:jid/photo - Set group photo
exports.groupsRoute.patch('/:jid/photo', async (req, res) => {
    try {
        const { jid } = req.params;
        const { photo_path } = req.body;
        if (!photo_path) {
            return res.status(400).json({
                success: false,
                error: 'photo_path is required'
            });
        }
        await (0, whatsapp_1.setGroupPhoto)(jid, photo_path);
        res.json({
            success: true,
            message: 'Group photo updated'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /groups/:jid/members - Add members
exports.groupsRoute.post('/:jid/members', async (req, res) => {
    try {
        const { jid } = req.params;
        const { participants } = req.body;
        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                error: 'participants array is required'
            });
        }
        const result = await (0, whatsapp_1.addGroupMembers)(jid, participants);
        res.json({
            success: true,
            result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /groups/:jid/members - Remove members
exports.groupsRoute.delete('/:jid/members', async (req, res) => {
    try {
        const { jid } = req.params;
        const { participants } = req.body;
        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                error: 'participants array is required'
            });
        }
        const result = await (0, whatsapp_1.removeGroupMembers)(jid, participants);
        res.json({
            success: true,
            result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /groups/:jid/admins - Promote to admin
exports.groupsRoute.post('/:jid/admins', async (req, res) => {
    try {
        const { jid } = req.params;
        const { participants } = req.body;
        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                error: 'participants array is required'
            });
        }
        const result = await (0, whatsapp_1.promoteGroupAdmin)(jid, participants);
        res.json({
            success: true,
            result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /groups/:jid/admins - Demote from admin
exports.groupsRoute.delete('/:jid/admins', async (req, res) => {
    try {
        const { jid } = req.params;
        const { participants } = req.body;
        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                error: 'participants array is required'
            });
        }
        const result = await (0, whatsapp_1.demoteGroupAdmin)(jid, participants);
        res.json({
            success: true,
            result
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// PATCH /groups/:jid/announce - Toggle admin-only messaging
exports.groupsRoute.patch('/:jid/announce', async (req, res) => {
    try {
        const { jid } = req.params;
        const { announce } = req.body;
        if (announce === undefined) {
            return res.status(400).json({
                success: false,
                error: 'announce boolean is required'
            });
        }
        await (0, whatsapp_1.setGroupAnnounce)(jid, announce);
        res.json({
            success: true,
            message: announce ? 'Only admins can send messages now' : 'All members can send messages now'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// PATCH /groups/:jid/locked - Toggle admin-only info editing
exports.groupsRoute.patch('/:jid/locked', async (req, res) => {
    try {
        const { jid } = req.params;
        const { locked } = req.body;
        if (locked === undefined) {
            return res.status(400).json({
                success: false,
                error: 'locked boolean is required'
            });
        }
        await (0, whatsapp_1.setGroupLocked)(jid, locked);
        res.json({
            success: true,
            message: locked ? 'Only admins can edit group info now' : 'All members can edit group info now'
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /groups/:jid/invite - Get/reset invite link
exports.groupsRoute.get('/:jid/invite', async (req, res) => {
    try {
        const { jid } = req.params;
        const reset = req.query.reset === 'true';
        const inviteCode = await (0, whatsapp_1.getGroupInviteLink)(jid, reset);
        res.json({
            success: true,
            inviteLink: `https://chat.whatsapp.com/${inviteCode}`,
            reset
        });
    }
    catch (error) {
        const err = error;
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /polls - Create poll
exports.groupsRoute.post('/polls', async (req, res) => {
    try {
        const { chat_jid, question, options, max_selections } = req.body;
        if (!chat_jid || !question || !options) {
            return res.status(400).json({
                success: false,
                error: 'chat_jid, question, and options are required'
            });
        }
        const result = await (0, whatsapp_1.createPoll)(chat_jid, question, options, max_selections || 1);
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
//# sourceMappingURL=groups.js.map