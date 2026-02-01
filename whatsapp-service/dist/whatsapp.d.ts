/**
 * WhatsApp Service - Full MCP Parity
 * All 54 endpoints supported
 *
 * Reference: /Users/omm/Vaults/Claude Setup/Memory/whatsapp-mcp-endpoints-reference.md
 */
import { Client, Message } from 'whatsapp-web.js';
export type ConnectionState = 'disconnected' | 'connecting' | 'qr_ready' | 'authenticated' | 'ready';
export interface SendMessageOptions {
    replyTo?: string;
    replyToSender?: string;
}
export interface MessageFilter {
    after?: string;
    before?: string;
    senderPhone?: string;
    chatJid?: string;
    query?: string;
    limit?: number;
    page?: number;
    includeContext?: boolean;
    contextBefore?: number;
    contextAfter?: number;
}
export interface ChatFilter {
    query?: string;
    limit?: number;
    page?: number;
    includeLastMessage?: boolean;
    sortBy?: 'last_active' | 'name';
}
export interface BulkResult {
    phone: string;
    success: boolean;
    error?: string;
}
export declare function getState(): ConnectionState;
export declare function getQRCode(): string | null;
export declare function getClient(): Client | null;
export declare function ensureConnected(): Client;
export declare function initializeClient(): Promise<void>;
export declare function disconnect(): Promise<void>;
export declare function getClientInfo(): {
    phoneNumber?: string;
    pushName?: string;
} | null;
export declare function formatPhoneNumber(phone: string): string;
export declare function formatGroupJid(jid: string): string;
export declare function sendMessage(to: string, message: string, options?: SendMessageOptions): Promise<Message>;
export declare function sendFile(to: string, filePath: string): Promise<Message>;
export declare function sendAudioMessage(to: string, filePath: string): Promise<Message>;
export declare function listMessages(filter: MessageFilter): Promise<{
    messages: any[];
    hasMore: boolean;
}>;
export declare function getMessageContext(messageId: string, chatJid: string, before?: number, after?: number): Promise<any[]>;
export declare function forwardMessage(sourceChatJid: string, messageId: string, targetChatJid: string): Promise<{
    success: boolean;
    messageId: string;
}>;
export declare function editMessage(chatJid: string, messageId: string, newContent: string): Promise<Message | null>;
export declare function deleteMessage(chatJid: string, messageId: string, forEveryone?: boolean): Promise<void>;
export declare function sendReaction(chatJid: string, messageId: string, reaction: string, sender?: string): Promise<void>;
export declare function downloadMedia(messageId: string, chatJid: string): Promise<{
    path: string;
    mimetype: string;
}>;
export declare function sendBulkMessages(recipients: Array<{
    phone: string;
    message: string;
}>, delayMs?: number): Promise<BulkResult[]>;
export declare function searchContacts(query: string): Promise<any[]>;
export declare function listChats(filter: ChatFilter): Promise<{
    chats: any[];
    hasMore: boolean;
}>;
export declare function getChat(jid: string, includeLastMessage?: boolean): Promise<any>;
export declare function getDirectChatByContact(phone: string): Promise<any>;
export declare function getContactChats(jid: string, limit?: number, page?: number): Promise<any[]>;
export declare function getLastInteraction(jid: string): Promise<any | null>;
export declare function markRead(chatJid: string, messageIds: string[], sender?: string): Promise<void>;
export declare function getJoinedGroups(): Promise<any[]>;
export declare function getGroupParticipants(groupJid: string): Promise<any[]>;
export declare function createGroup(name: string, participants: string[]): Promise<any>;
export declare function leaveGroup(groupJid: string): Promise<void>;
export declare function setGroupName(groupJid: string, name: string): Promise<void>;
export declare function setGroupDescription(groupJid: string, description: string): Promise<void>;
export declare function setGroupPhoto(groupJid: string, photoPath: string): Promise<void>;
export declare function addGroupMembers(groupJid: string, participants: string[]): Promise<any>;
export declare function removeGroupMembers(groupJid: string, participants: string[]): Promise<any>;
export declare function promoteGroupAdmin(groupJid: string, participants: string[]): Promise<any>;
export declare function demoteGroupAdmin(groupJid: string, participants: string[]): Promise<any>;
export declare function setGroupAnnounce(groupJid: string, announce: boolean): Promise<void>;
export declare function setGroupLocked(groupJid: string, locked: boolean): Promise<void>;
export declare function getGroupInviteLink(groupJid: string, reset?: boolean): Promise<string>;
export declare function joinGroupWithLink(inviteLink: string): Promise<any>;
export declare function previewGroupLink(inviteLink: string): Promise<any>;
export declare function createPoll(chatJid: string, question: string, options: string[], maxSelections?: number): Promise<Message>;
export declare function listSubscribedNewsletters(): Promise<any[]>;
export declare function getNewsletterInfo(newsletterJid: string): Promise<any>;
export declare function previewNewsletterLink(inviteLink: string): Promise<any>;
export declare function followNewsletter(newsletterJid: string): Promise<void>;
export declare function unfollowNewsletter(newsletterJid: string): Promise<void>;
export declare function reactToNewsletterMessage(newsletterJid: string, serverId: number, messageId: string, reaction: string): Promise<void>;
export declare function createNewsletter(name: string, description?: string): Promise<any>;
export declare function resolveLid(lid: string): {
    phone?: string;
    name?: string;
} | null;
export declare function resolvePhoneToLid(phone: string): string | null;
export declare function resolveBatchLids(lids: string[], phones: string[]): any;
export declare function getLidCacheStats(): {
    total: number;
    withNames: number;
};
export declare function listLidMappings(limit?: number): any[];
export declare function populateLidCache(): Promise<{
    groupsProcessed: number;
    mappingsAdded: number;
}>;
export declare function getConnectionStatus(): Promise<any>;
export declare function getProfilePicture(jid: string): Promise<string | null>;
export declare function setStatusMessage(status: string): Promise<void>;
export declare function getUserInfo(jids: string[]): Promise<any[]>;
export declare function getBusinessProfile(jid: string): Promise<any>;
export declare function sendTypingIndicator(chatJid: string, typing?: boolean): Promise<void>;
export declare function isOnWhatsApp(phoneNumbers: string[]): Promise<any[]>;
//# sourceMappingURL=whatsapp.d.ts.map