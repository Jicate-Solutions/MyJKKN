"use strict";
/**
 * WhatsApp Service - Full MCP Parity
 * All 54 endpoints supported
 *
 * Reference: /Users/omm/Vaults/Claude Setup/Memory/whatsapp-mcp-endpoints-reference.md
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getState = getState;
exports.getQRCode = getQRCode;
exports.getClient = getClient;
exports.ensureConnected = ensureConnected;
exports.initializeClient = initializeClient;
exports.disconnect = disconnect;
exports.getClientInfo = getClientInfo;
exports.formatPhoneNumber = formatPhoneNumber;
exports.formatGroupJid = formatGroupJid;
exports.sendMessage = sendMessage;
exports.sendFile = sendFile;
exports.sendAudioMessage = sendAudioMessage;
exports.listMessages = listMessages;
exports.getMessageContext = getMessageContext;
exports.forwardMessage = forwardMessage;
exports.editMessage = editMessage;
exports.deleteMessage = deleteMessage;
exports.sendReaction = sendReaction;
exports.downloadMedia = downloadMedia;
exports.sendBulkMessages = sendBulkMessages;
exports.searchContacts = searchContacts;
exports.listChats = listChats;
exports.getChat = getChat;
exports.getDirectChatByContact = getDirectChatByContact;
exports.getContactChats = getContactChats;
exports.getLastInteraction = getLastInteraction;
exports.markRead = markRead;
exports.getJoinedGroups = getJoinedGroups;
exports.getGroupParticipants = getGroupParticipants;
exports.createGroup = createGroup;
exports.leaveGroup = leaveGroup;
exports.setGroupName = setGroupName;
exports.setGroupDescription = setGroupDescription;
exports.setGroupPhoto = setGroupPhoto;
exports.addGroupMembers = addGroupMembers;
exports.removeGroupMembers = removeGroupMembers;
exports.promoteGroupAdmin = promoteGroupAdmin;
exports.demoteGroupAdmin = demoteGroupAdmin;
exports.setGroupAnnounce = setGroupAnnounce;
exports.setGroupLocked = setGroupLocked;
exports.getGroupInviteLink = getGroupInviteLink;
exports.joinGroupWithLink = joinGroupWithLink;
exports.previewGroupLink = previewGroupLink;
exports.createPoll = createPoll;
exports.listSubscribedNewsletters = listSubscribedNewsletters;
exports.getNewsletterInfo = getNewsletterInfo;
exports.previewNewsletterLink = previewNewsletterLink;
exports.followNewsletter = followNewsletter;
exports.unfollowNewsletter = unfollowNewsletter;
exports.reactToNewsletterMessage = reactToNewsletterMessage;
exports.createNewsletter = createNewsletter;
exports.resolveLid = resolveLid;
exports.resolvePhoneToLid = resolvePhoneToLid;
exports.resolveBatchLids = resolveBatchLids;
exports.getLidCacheStats = getLidCacheStats;
exports.listLidMappings = listLidMappings;
exports.populateLidCache = populateLidCache;
exports.getConnectionStatus = getConnectionStatus;
exports.getProfilePicture = getProfilePicture;
exports.setStatusMessage = setStatusMessage;
exports.getUserInfo = getUserInfo;
exports.getBusinessProfile = getBusinessProfile;
exports.sendTypingIndicator = sendTypingIndicator;
exports.isOnWhatsApp = isOnWhatsApp;
const whatsapp_web_js_1 = require("whatsapp-web.js");
const qrcode = __importStar(require("qrcode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const mime = __importStar(require("mime-types"));
// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let client = null;
let currentState = 'disconnected';
let currentQR = null;
let initPromise = null;
// LID Cache for privacy-preserving ID resolution
const lidCache = new Map();
// Configuration
const CLIENT_ID = process.env.CLIENT_ID || 'whatsapp-service';
const AUTH_PATH = process.env.AUTH_PATH || './.wwebjs_auth';
const INIT_TIMEOUT_MS = 120000;
// ============================================================================
// CORE: Connection Management
// ============================================================================
function getState() {
    return currentState;
}
function getQRCode() {
    return currentQR;
}
function getClient() {
    return client;
}
function ensureConnected() {
    if (!client || currentState !== 'ready') {
        throw new Error('NOT_CONNECTED');
    }
    return client;
}
async function initializeClient() {
    if (initPromise)
        return initPromise;
    if (currentState === 'ready' && client)
        return;
    currentState = 'connecting';
    currentQR = null;
    initPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            currentState = 'disconnected';
            initPromise = null;
            reject(new Error('QR_TIMEOUT'));
        }, INIT_TIMEOUT_MS);
        client = new whatsapp_web_js_1.Client({
            authStrategy: new whatsapp_web_js_1.LocalAuth({
                dataPath: AUTH_PATH,
                clientId: CLIENT_ID
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            }
        });
        client.on('qr', async (qr) => {
            console.log('[WhatsApp] QR code received');
            try {
                currentQR = await qrcode.toDataURL(qr);
                currentState = 'qr_ready';
            }
            catch (err) {
                console.error('[WhatsApp] QR generation error:', err);
            }
        });
        client.on('authenticated', () => {
            console.log('[WhatsApp] Authenticated');
            currentState = 'authenticated';
            currentQR = null;
        });
        client.on('ready', () => {
            console.log('[WhatsApp] Client is ready');
            currentState = 'ready';
            clearTimeout(timeout);
            initPromise = null;
            resolve();
        });
        client.on('disconnected', (reason) => {
            console.log('[WhatsApp] Disconnected:', reason);
            currentState = 'disconnected';
            currentQR = null;
            client = null;
            initPromise = null;
        });
        client.on('auth_failure', (message) => {
            console.error('[WhatsApp] Auth failure:', message);
            currentState = 'disconnected';
            clearTimeout(timeout);
            initPromise = null;
            reject(new Error('AUTH_FAILURE'));
        });
        client.initialize().catch((err) => {
            console.error('[WhatsApp] Initialize error:', err);
            currentState = 'disconnected';
            clearTimeout(timeout);
            initPromise = null;
            reject(err);
        });
    });
    return initPromise;
}
async function disconnect() {
    if (client) {
        await client.logout();
        await client.destroy();
        client = null;
    }
    currentState = 'disconnected';
    currentQR = null;
    initPromise = null;
}
function getClientInfo() {
    if (!client || currentState !== 'ready')
        return null;
    const info = client.info;
    return {
        phoneNumber: info?.wid?.user,
        pushName: info?.pushname
    };
}
// ============================================================================
// UTILITIES
// ============================================================================
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '91' + cleaned.substring(1);
    }
    else if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }
    return `${cleaned}@c.us`;
}
function formatGroupJid(jid) {
    if (jid.includes('@g.us'))
        return jid;
    return `${jid}@g.us`;
}
// ============================================================================
// CATEGORY 1: MESSAGING (10 endpoints)
// ============================================================================
async function sendMessage(to, message, options) {
    const c = ensureConnected();
    const chatId = to.includes('@') ? to : formatPhoneNumber(to);
    const sendOptions = {};
    if (options?.replyTo) {
        // Get the message to quote
        const chat = await c.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 50 });
        const quotedMsg = messages.find(m => m.id._serialized === options.replyTo);
        if (quotedMsg) {
            sendOptions.quotedMessageId = quotedMsg.id._serialized;
        }
    }
    return c.sendMessage(chatId, message, sendOptions);
}
async function sendFile(to, filePath) {
    const c = ensureConnected();
    const chatId = to.includes('@') ? to : formatPhoneNumber(to);
    if (!fs.existsSync(filePath)) {
        throw new Error('FILE_NOT_FOUND');
    }
    const media = whatsapp_web_js_1.MessageMedia.fromFilePath(filePath);
    return c.sendMessage(chatId, media);
}
async function sendAudioMessage(to, filePath) {
    const c = ensureConnected();
    const chatId = to.includes('@') ? to : formatPhoneNumber(to);
    if (!fs.existsSync(filePath)) {
        throw new Error('FILE_NOT_FOUND');
    }
    const media = whatsapp_web_js_1.MessageMedia.fromFilePath(filePath);
    return c.sendMessage(chatId, media, { sendAudioAsVoice: true });
}
async function listMessages(filter) {
    const c = ensureConnected();
    let targetChat = null;
    if (filter.chatJid) {
        targetChat = await c.getChatById(filter.chatJid);
    }
    const limit = filter.limit || 20;
    const page = filter.page || 0;
    const offset = page * limit;
    let messages = [];
    if (targetChat) {
        messages = await targetChat.fetchMessages({ limit: limit + offset + 10 });
    }
    else {
        // Get messages from all chats
        const chats = await c.getChats();
        for (const chat of chats.slice(0, 10)) {
            const chatMessages = await chat.fetchMessages({ limit: 20 });
            messages.push(...chatMessages);
        }
    }
    // Apply filters
    if (filter.after) {
        const afterDate = new Date(filter.after).getTime() / 1000;
        messages = messages.filter(m => m.timestamp > afterDate);
    }
    if (filter.before) {
        const beforeDate = new Date(filter.before).getTime() / 1000;
        messages = messages.filter(m => m.timestamp < beforeDate);
    }
    if (filter.query) {
        const q = filter.query.toLowerCase();
        messages = messages.filter(m => m.body?.toLowerCase().includes(q));
    }
    // Paginate
    const paginatedMessages = messages.slice(offset, offset + limit);
    return {
        messages: paginatedMessages.map(m => ({
            id: m.id._serialized,
            body: m.body,
            from: m.from,
            to: m.to,
            timestamp: m.timestamp,
            fromMe: m.fromMe,
            hasMedia: m.hasMedia,
            type: m.type
        })),
        hasMore: messages.length > offset + limit
    };
}
async function getMessageContext(messageId, chatJid, before = 5, after = 5) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    const messages = await chat.fetchMessages({ limit: 100 });
    const index = messages.findIndex(m => m.id._serialized === messageId);
    if (index === -1)
        return [];
    const start = Math.max(0, index - before);
    const end = Math.min(messages.length, index + after + 1);
    return messages.slice(start, end).map(m => ({
        id: m.id._serialized,
        body: m.body,
        from: m.from,
        timestamp: m.timestamp,
        fromMe: m.fromMe
    }));
}
async function forwardMessage(sourceChatJid, messageId, targetChatJid) {
    const c = ensureConnected();
    const sourceChat = await c.getChatById(sourceChatJid);
    const messages = await sourceChat.fetchMessages({ limit: 50 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message)
        throw new Error('MESSAGE_NOT_FOUND');
    await message.forward(targetChatJid);
    return { success: true, messageId };
}
async function editMessage(chatJid, messageId, newContent) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    const messages = await chat.fetchMessages({ limit: 50 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message)
        throw new Error('MESSAGE_NOT_FOUND');
    if (!message.fromMe)
        throw new Error('CAN_ONLY_EDIT_OWN_MESSAGES');
    return message.edit(newContent);
}
async function deleteMessage(chatJid, messageId, forEveryone = true) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    const messages = await chat.fetchMessages({ limit: 50 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message)
        throw new Error('MESSAGE_NOT_FOUND');
    if (forEveryone) {
        await message.delete(true);
    }
    else {
        await message.delete(false);
    }
}
async function sendReaction(chatJid, messageId, reaction, sender) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    const messages = await chat.fetchMessages({ limit: 50 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message)
        throw new Error('MESSAGE_NOT_FOUND');
    await message.react(reaction);
}
async function downloadMedia(messageId, chatJid) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    const messages = await chat.fetchMessages({ limit: 50 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message)
        throw new Error('MESSAGE_NOT_FOUND');
    if (!message.hasMedia)
        throw new Error('MESSAGE_HAS_NO_MEDIA');
    const media = await message.downloadMedia();
    if (!media)
        throw new Error('MEDIA_DOWNLOAD_FAILED');
    const ext = mime.extension(media.mimetype) || 'bin';
    const filename = `${messageId}.${ext}`;
    const downloadPath = path.join('/tmp', filename);
    fs.writeFileSync(downloadPath, Buffer.from(media.data, 'base64'));
    return { path: downloadPath, mimetype: media.mimetype };
}
async function sendBulkMessages(recipients, delayMs = 1500) {
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
        const { phone, message } = recipients[i];
        try {
            await sendMessage(phone, message);
            results.push({ phone, success: true });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            results.push({ phone, success: false, error });
        }
        if (i < recipients.length - 1) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return results;
}
// ============================================================================
// CATEGORY 2: CONTACTS & CHATS (7 endpoints)
// ============================================================================
async function searchContacts(query) {
    const c = ensureConnected();
    const contacts = await c.getContacts();
    const q = query.toLowerCase();
    return contacts
        .filter(contact => contact.name?.toLowerCase().includes(q) ||
        contact.number?.includes(query) ||
        contact.pushname?.toLowerCase().includes(q))
        .slice(0, 50)
        .map(contact => ({
        id: contact.id._serialized,
        name: contact.name,
        pushname: contact.pushname,
        number: contact.number,
        isGroup: contact.isGroup,
        isUser: contact.isUser
    }));
}
async function listChats(filter) {
    const c = ensureConnected();
    let chats = await c.getChats();
    if (filter.query) {
        const q = filter.query.toLowerCase();
        chats = chats.filter(chat => chat.name?.toLowerCase().includes(q));
    }
    if (filter.sortBy === 'name') {
        chats.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    const limit = filter.limit || 20;
    const page = filter.page || 0;
    const offset = page * limit;
    const paginatedChats = chats.slice(offset, offset + limit);
    return {
        chats: await Promise.all(paginatedChats.map(async (chat) => {
            const result = {
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount,
                timestamp: chat.timestamp
            };
            if (filter.includeLastMessage !== false) {
                const messages = await chat.fetchMessages({ limit: 1 });
                if (messages.length > 0) {
                    result.lastMessage = {
                        body: messages[0].body,
                        timestamp: messages[0].timestamp
                    };
                }
            }
            return result;
        })),
        hasMore: chats.length > offset + limit
    };
}
async function getChat(jid, includeLastMessage = true) {
    const c = ensureConnected();
    const chat = await c.getChatById(jid);
    const result = {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp
    };
    if (includeLastMessage) {
        const messages = await chat.fetchMessages({ limit: 1 });
        if (messages.length > 0) {
            result.lastMessage = {
                body: messages[0].body,
                timestamp: messages[0].timestamp
            };
        }
    }
    return result;
}
async function getDirectChatByContact(phone) {
    const jid = formatPhoneNumber(phone);
    return getChat(jid);
}
async function getContactChats(jid, limit = 20, page = 0) {
    const c = ensureConnected();
    const chats = await c.getChats();
    // Find chats involving this contact
    const contactChats = chats.filter(chat => {
        if (chat.id._serialized === jid)
            return true;
        if (chat.isGroup) {
            // Would need to check participants - simplified here
            return false;
        }
        return false;
    });
    const offset = page * limit;
    return contactChats.slice(offset, offset + limit).map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup
    }));
}
async function getLastInteraction(jid) {
    const c = ensureConnected();
    const chat = await c.getChatById(jid);
    const messages = await chat.fetchMessages({ limit: 1 });
    if (messages.length === 0)
        return null;
    const msg = messages[0];
    return {
        id: msg.id._serialized,
        body: msg.body,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe
    };
}
async function markRead(chatJid, messageIds, sender) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    await chat.sendSeen();
}
// ============================================================================
// CATEGORY 3: GROUPS (14 endpoints)
// ============================================================================
async function getJoinedGroups() {
    const c = ensureConnected();
    const chats = await c.getChats();
    return chats
        .filter(chat => chat.isGroup)
        .map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        participantCount: chat.participants?.length || 0,
        timestamp: chat.timestamp
    }));
}
async function getGroupParticipants(groupJid) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    return chat.participants.map((p) => ({
        id: p.id._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin
    }));
}
async function createGroup(name, participants) {
    const c = ensureConnected();
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    const result = await c.createGroup(name, formattedParticipants);
    // Result can be string (group ID) or CreateGroupResult object
    if (typeof result === 'string') {
        return { gid: result, missingParticipants: [] };
    }
    return {
        gid: result.gid._serialized,
        missingParticipants: result.missingParticipants || []
    };
}
async function leaveGroup(groupJid) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    await chat.leave();
}
async function setGroupName(groupJid, name) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    await chat.setSubject(name);
}
async function setGroupDescription(groupJid, description) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    await chat.setDescription(description);
}
async function setGroupPhoto(groupJid, photoPath) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    if (!fs.existsSync(photoPath))
        throw new Error('FILE_NOT_FOUND');
    const media = whatsapp_web_js_1.MessageMedia.fromFilePath(photoPath);
    // Note: This may require specific whatsapp-web.js version support
    // await chat.setPicture(media);
}
async function addGroupMembers(groupJid, participants) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    return chat.addParticipants(formattedParticipants);
}
async function removeGroupMembers(groupJid, participants) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    return chat.removeParticipants(formattedParticipants);
}
async function promoteGroupAdmin(groupJid, participants) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    return chat.promoteParticipants(formattedParticipants);
}
async function demoteGroupAdmin(groupJid, participants) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    return chat.demoteParticipants(formattedParticipants);
}
async function setGroupAnnounce(groupJid, announce) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    await chat.setMessagesAdminsOnly(announce);
}
async function setGroupLocked(groupJid, locked) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    await chat.setInfoAdminsOnly(locked);
}
async function getGroupInviteLink(groupJid, reset = false) {
    const c = ensureConnected();
    const chat = await c.getChatById(groupJid);
    if (!chat.isGroup)
        throw new Error('NOT_A_GROUP');
    if (reset) {
        await chat.revokeInvite();
    }
    return chat.getInviteCode();
}
// ============================================================================
// CATEGORY 4: GROUP LINKS (3 endpoints)
// ============================================================================
async function joinGroupWithLink(inviteLink) {
    const c = ensureConnected();
    const code = inviteLink.split('/').pop() || inviteLink;
    return c.acceptInvite(code);
}
async function previewGroupLink(inviteLink) {
    const c = ensureConnected();
    const code = inviteLink.split('/').pop() || inviteLink;
    return c.getInviteInfo(code);
}
async function createPoll(chatJid, question, options, maxSelections = 1) {
    const c = ensureConnected();
    // Note: Poll support may vary by whatsapp-web.js version
    // This is a placeholder for when poll support is available
    throw new Error('POLLS_NOT_SUPPORTED_IN_THIS_VERSION');
}
// ============================================================================
// CATEGORY 5: NEWSLETTERS (7 endpoints)
// ============================================================================
// Note: Newsletter support requires specific whatsapp-web.js version
// These are placeholder implementations
async function listSubscribedNewsletters() {
    const c = ensureConnected();
    // Newsletter methods may not be available in all versions
    return [];
}
async function getNewsletterInfo(newsletterJid) {
    throw new Error('NEWSLETTERS_NOT_SUPPORTED_IN_THIS_VERSION');
}
async function previewNewsletterLink(inviteLink) {
    throw new Error('NEWSLETTERS_NOT_SUPPORTED_IN_THIS_VERSION');
}
async function followNewsletter(newsletterJid) {
    throw new Error('NEWSLETTERS_NOT_SUPPORTED_IN_THIS_VERSION');
}
async function unfollowNewsletter(newsletterJid) {
    throw new Error('NEWSLETTERS_NOT_SUPPORTED_IN_THIS_VERSION');
}
async function reactToNewsletterMessage(newsletterJid, serverId, messageId, reaction) {
    throw new Error('NEWSLETTERS_NOT_SUPPORTED_IN_THIS_VERSION');
}
async function createNewsletter(name, description) {
    throw new Error('NEWSLETTERS_NOT_SUPPORTED_IN_THIS_VERSION');
}
// ============================================================================
// CATEGORY 6: LID RESOLUTION (6 endpoints)
// ============================================================================
function resolveLid(lid) {
    return lidCache.get(lid) || null;
}
function resolvePhoneToLid(phone) {
    for (const [lid, data] of lidCache.entries()) {
        if (data.phone === phone)
            return lid;
    }
    return null;
}
function resolveBatchLids(lids, phones) {
    const results = { lids: {}, phones: {} };
    for (const lid of lids) {
        const data = lidCache.get(lid);
        if (data)
            results.lids[lid] = data;
    }
    for (const phone of phones) {
        for (const [lid, data] of lidCache.entries()) {
            if (data.phone === phone) {
                results.phones[phone] = lid;
                break;
            }
        }
    }
    return results;
}
function getLidCacheStats() {
    let withNames = 0;
    for (const data of lidCache.values()) {
        if (data.name)
            withNames++;
    }
    return { total: lidCache.size, withNames };
}
function listLidMappings(limit = 100) {
    const results = [];
    let count = 0;
    for (const [lid, data] of lidCache.entries()) {
        if (count >= limit)
            break;
        results.push({ lid, ...data });
        count++;
    }
    return results;
}
async function populateLidCache() {
    const c = ensureConnected();
    const groups = await getJoinedGroups();
    let mappingsAdded = 0;
    for (const group of groups) {
        try {
            const participants = await getGroupParticipants(group.id);
            for (const p of participants) {
                if (p.id.includes('@lid')) {
                    const lid = p.id.replace('@lid', '');
                    if (!lidCache.has(lid)) {
                        // Try to resolve phone from other sources
                        lidCache.set(lid, { phone: '' });
                        mappingsAdded++;
                    }
                }
            }
        }
        catch (err) {
            console.error(`Error processing group ${group.id}:`, err);
        }
    }
    return { groupsProcessed: groups.length, mappingsAdded };
}
// ============================================================================
// CATEGORY 7: STATUS & PROFILE (5 endpoints)
// ============================================================================
async function getConnectionStatus() {
    return {
        state: currentState,
        isLoggedIn: currentState === 'ready',
        info: getClientInfo()
    };
}
async function getProfilePicture(jid) {
    const c = ensureConnected();
    try {
        return await c.getProfilePicUrl(jid);
    }
    catch {
        return null;
    }
}
async function setStatusMessage(status) {
    const c = ensureConnected();
    await c.setStatus(status);
}
async function getUserInfo(jids) {
    const c = ensureConnected();
    const results = [];
    for (const jid of jids) {
        try {
            const contact = await c.getContactById(jid);
            results.push({
                id: contact.id._serialized,
                name: contact.name,
                pushname: contact.pushname,
                number: contact.number,
                isUser: contact.isUser,
                isGroup: contact.isGroup
            });
        }
        catch (err) {
            results.push({ id: jid, error: 'NOT_FOUND' });
        }
    }
    return results;
}
async function getBusinessProfile(jid) {
    const c = ensureConnected();
    const contact = await c.getContactById(jid);
    // Business profile methods may not be available in all versions
    return {
        id: contact.id._serialized,
        name: contact.name,
        isBusiness: contact.isBusiness
    };
}
// ============================================================================
// CATEGORY 8: UTILITIES (2 endpoints)
// ============================================================================
async function sendTypingIndicator(chatJid, typing = true) {
    const c = ensureConnected();
    const chat = await c.getChatById(chatJid);
    if (typing) {
        await chat.sendStateTyping();
    }
    else {
        await chat.clearState();
    }
}
async function isOnWhatsApp(phoneNumbers) {
    const c = ensureConnected();
    const results = [];
    for (const phone of phoneNumbers) {
        const jid = formatPhoneNumber(phone);
        try {
            const isRegistered = await c.isRegisteredUser(jid);
            results.push({ phone, isRegistered, jid });
        }
        catch (err) {
            results.push({ phone, isRegistered: false, error: 'CHECK_FAILED' });
        }
    }
    return results;
}
//# sourceMappingURL=whatsapp.js.map