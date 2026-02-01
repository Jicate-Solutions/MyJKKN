"use strict";
/**
 * MyJKKN WhatsApp Service (54 endpoints)
 *
 * Persistent WhatsApp service for MyJKKN.
 * Runs on Railway with Chromium for whatsapp-web.js.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// Route imports
const connect_1 = require("./routes/connect");
const status_1 = require("./routes/status");
const disconnect_1 = require("./routes/disconnect");
const messages_1 = require("./routes/messages");
const chats_1 = require("./routes/chats");
const contacts_1 = require("./routes/contacts");
const groups_1 = require("./routes/groups");
const newsletters_1 = require("./routes/newsletters");
const lid_1 = require("./routes/lid");
const profile_1 = require("./routes/profile");
const utils_1 = require("./routes/utils");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Parse allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'https://myjkkn.vercel.app',
    'http://localhost:3000'
];
// CORS configuration
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`[CORS] Blocked request from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// API Key authentication middleware
app.use((req, res, next) => {
    // Skip auth for health check
    if (req.path === '/health') {
        return next();
    }
    const apiKey = req.headers['x-api-key'];
    if (!process.env.API_KEY) {
        console.error('[Auth] API_KEY environment variable not set');
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
});
// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// ============================================================================
// ROUTES
// ============================================================================
// Health check (no auth required)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: 54
    });
});
// Core connection management
app.use('/connect', connect_1.connectRoute);
app.use('/status', status_1.statusRoute);
app.use('/disconnect', disconnect_1.disconnectRoute);
// Category 1: Messaging (10 endpoints)
app.use('/messages', messages_1.messagesRoute);
// Category 2: Contacts & Chats (7 endpoints)
app.use('/chats', chats_1.chatsRoute);
app.use('/contacts', contacts_1.contactsRoute);
// Category 3 & 4: Groups (14 + 3 endpoints)
app.use('/groups', groups_1.groupsRoute);
// Category 5: Newsletters (7 endpoints)
app.use('/newsletters', newsletters_1.newslettersRoute);
// Category 6: LID Resolution (6 endpoints)
app.use('/lid', lid_1.lidRoute);
// Category 7: Status & Profile (5 endpoints)
app.use('/profile', profile_1.profileRoute);
// Category 8: Utilities (2 endpoints)
app.use('/', utils_1.utilsRoute);
// ============================================================================
// ERROR HANDLING
// ============================================================================
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        availableEndpoints: [
            'GET /health',
            'POST /connect',
            'GET /status',
            'POST /disconnect',
            'POST /messages/send',
            'POST /messages/send-file',
            'POST /messages/send-audio',
            'GET /messages',
            'GET /messages/:id/context',
            'POST /messages/forward',
            'PATCH /messages/:id',
            'DELETE /messages/:id',
            'POST /messages/:id/reaction',
            'GET /messages/:id/media',
            'POST /messages/send-bulk',
            'GET /contacts/search',
            'GET /chats',
            'GET /chats/:jid',
            'GET /chats/by-phone/:phone',
            'GET /contacts/:jid/chats',
            'GET /contacts/:jid/last',
            'POST /chats/:jid/read',
            'GET /groups',
            'GET /groups/:jid/participants',
            'POST /groups',
            'POST /groups/:jid/leave',
            'PATCH /groups/:jid/name',
            'PATCH /groups/:jid/description',
            'PATCH /groups/:jid/photo',
            'POST /groups/:jid/members',
            'DELETE /groups/:jid/members',
            'POST /groups/:jid/admins',
            'DELETE /groups/:jid/admins',
            'PATCH /groups/:jid/announce',
            'PATCH /groups/:jid/locked',
            'GET /groups/:jid/invite',
            'POST /groups/join',
            'GET /groups/preview',
            'POST /polls',
            'GET /newsletters',
            'GET /newsletters/:jid',
            'GET /newsletters/preview',
            'POST /newsletters/:jid/follow',
            'POST /newsletters/:jid/unfollow',
            'POST /newsletters/:jid/react',
            'POST /newsletters',
            'GET /lid/resolve',
            'GET /lid/phone',
            'POST /lid/batch',
            'GET /lid/stats',
            'GET /lid/mappings',
            'POST /lid/populate',
            'GET /profile/:jid/picture',
            'PATCH /profile/status',
            'POST /users/info',
            'GET /business/:jid',
            'POST /typing',
            'POST /check'
        ]
    });
});
// Global error handler
app.use((err, req, res, next) => {
    console.error('[Error]', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    // Handle specific errors
    if (err.message === 'NOT_CONNECTED') {
        return res.status(503).json({
            error: 'WhatsApp not connected',
            code: 'NOT_CONNECTED',
            suggestion: 'Call POST /connect first'
        });
    }
    if (err.message === 'FILE_NOT_FOUND') {
        return res.status(400).json({
            error: 'File not found',
            code: 'FILE_NOT_FOUND'
        });
    }
    if (err.message === 'MESSAGE_NOT_FOUND') {
        return res.status(404).json({
            error: 'Message not found',
            code: 'MESSAGE_NOT_FOUND'
        });
    }
    if (err.message === 'NOT_A_GROUP') {
        return res.status(400).json({
            error: 'Chat is not a group',
            code: 'NOT_A_GROUP'
        });
    }
    res.status(500).json({
        error: 'An internal error occurred',
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       MyJKKN WhatsApp Service                                ║');
    console.log('║       Version 1.0.0 | 54 Endpoints                           ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Port: ${PORT}                                                   ║`);
    console.log(`║  Origins: ${allowedOrigins.join(', ').slice(0, 45).padEnd(45)}   ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
});
exports.default = app;
//# sourceMappingURL=index.js.map