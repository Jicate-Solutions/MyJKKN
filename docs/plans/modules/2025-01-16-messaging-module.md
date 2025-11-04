# Messaging Module - Implementation Plan

**Created:** 2025-01-16
**Module:** Messaging (Real-time Bug Report Communication)
**Estimated Time:** 5-6 hours
**Dependencies:** Bug Reports Module
**Tech Stack:** Next.js 15, Supabase Realtime, TypeScript, React Query

---

## 📋 Overview

The Messaging Module enhances bug report communication with real-time chat functionality. It builds on the basic messaging implemented in the Bug Reports Module by adding real-time updates, typing indicators, and message threading.

### Key Features

1. **Real-time Messaging**: Live message updates using Supabase Realtime
2. **Message Threading**: Reply to specific messages
3. **Typing Indicators**: Show when others are typing
4. **Read Receipts**: Track message read status
5. **File Attachments**: Attach screenshots and files to messages
6. **@ Mentions**: Mention team members in messages
7. **Message Reactions**: React to messages with emojis

---

## 🗄️ Database Schema Reference

The basic messaging tables already exist from Phase 2. We'll enhance them:

```sql
-- bug_report_messages table (already exists)
CREATE TABLE bug_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enhancements needed:
```

### New Tables to Add:

```sql
-- Message metadata (reactions, read receipts)
CREATE TABLE bug_report_message_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES bug_report_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL, -- 'reaction', 'read'
  value TEXT, -- Emoji for reactions
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, type, value)
);

-- Message attachments
CREATE TABLE bug_report_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES bug_report_messages(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Typing indicators (ephemeral, can use Supabase Realtime Presence instead)
CREATE TABLE bug_report_typing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bug_report_id, user_id)
);

-- Indexes
CREATE INDEX idx_message_metadata ON bug_report_message_metadata(message_id);
CREATE INDEX idx_message_attachments ON bug_report_message_attachments(message_id);
CREATE INDEX idx_typing_bug ON bug_report_typing(bug_report_id);
```

---

## 🏗️ Architecture - 5 Layers

1. **Types Layer** → Message metadata, attachment, typing interfaces
2. **Services Layer** → Enhanced messaging with attachments, reactions
3. **Hooks Layer** → Real-time subscriptions, typing indicators
4. **Components Layer** → Message bubbles, reactions, attachment viewer
5. **Pages Layer** → Enhanced message UI in bug detail page
6. **Real-time Setup** → Supabase Realtime subscriptions

---

## 📁 File Structure

```
bug-reporter-platform/
├── packages/
│   └── shared/
│       └── types/
│           └── messaging.ts          # Layer 1: Enhanced types
│
└── apps/
    └── platform/
        ├── lib/
        │   └── services/
        │       └── messaging/
        │           └── messaging-service.ts    # Layer 2
        │
        ├── hooks/
        │   └── messaging/
        │       ├── use-realtime-messages.ts    # Layer 3: Real-time
        │       ├── use-typing-indicator.ts
        │       └── use-message-reactions.ts
        │
        └── app/
            └── (dashboard)/
                └── bugs/
                    └── [id]/
                        └── _components/
                            ├── realtime-messages.tsx    # Layer 4
                            ├── message-bubble.tsx
                            ├── message-reactions.tsx
                            ├── typing-indicator.tsx
                            ├── attachment-uploader.tsx
                            └── message-input-enhanced.tsx
```

---

## 🚀 Implementation Steps

### Layer 1: Types Layer (15-20 minutes)

Create `packages/shared/types/messaging.ts`:

```typescript
import type { BugReportMessage } from './bug-reports';

// Enhanced message with metadata
export interface EnhancedBugReportMessage extends BugReportMessage {
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  read_by?: string[]; // User IDs who read the message
  is_read?: boolean; // For current user
}

// Message attachment
export interface MessageAttachment {
  id: string;
  message_id: string;
  file_url: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}

// Message reaction
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// Typing indicator
export interface TypingIndicator {
  user_id: string;
  user_email: string;
  user_name?: string;
}

// Message with thread (future enhancement)
export interface ThreadedMessage extends EnhancedBugReportMessage {
  parent_message_id?: string;
  replies?: ThreadedMessage[];
}

// Real-time message event
export interface RealtimeMessageEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  message: EnhancedBugReportMessage;
}
```

**Testing Checklist:**
- [ ] Verify all types compile
- [ ] Export from package index

---

### Layer 2: Services Layer (75-90 minutes)

Create `apps/platform/lib/services/messaging/messaging-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EnhancedBugReportMessage,
  MessageAttachment,
  MessageReaction
} from '@your-org/shared/types/messaging';

export class MessagingService {
  /**
   * Send message with optional attachments
   */
  static async sendMessage(
    bugReportId: string,
    message: string,
    attachments?: File[]
  ): Promise<EnhancedBugReportMessage> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      // Create message
      const { data: newMessage, error: messageError } = await supabase
        .from('bug_report_messages')
        .insert([{
          bug_report_id: bugReportId,
          user_id: user.id,
          message
        }])
        .select(`
          *,
          user:auth.users(id, email, raw_user_meta_data)
        `)
        .single();

      if (messageError) throw messageError;

      // Upload attachments if any
      if (attachments && attachments.length > 0) {
        const uploadedAttachments = await this.uploadAttachments(
          newMessage.id,
          attachments
        );
        newMessage.attachments = uploadedAttachments;
      }

      console.log(`[messaging] Sent message on bug ${bugReportId}`);
      return newMessage;
    } catch (error) {
      console.error('[messaging] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Upload message attachments
   */
  static async uploadAttachments(
    messageId: string,
    files: File[]
  ): Promise<MessageAttachment[]> {
    try {
      const supabase = createClientSupabaseClient();
      const attachments: MessageAttachment[] = [];

      for (const file of files) {
        // Upload file to Supabase Storage
        const fileName = `${messageId}/${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('bug-attachments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase
          .storage
          .from('bug-attachments')
          .getPublicUrl(fileName);

        // Save attachment metadata
        const { data: attachment, error: attachmentError } = await supabase
          .from('bug_report_message_attachments')
          .insert([{
            message_id: messageId,
            file_url: publicUrl,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size
          }])
          .select()
          .single();

        if (attachmentError) throw attachmentError;

        attachments.push(attachment);
      }

      return attachments;
    } catch (error) {
      console.error('[messaging] Error uploading attachments:', error);
      throw error;
    }
  }

  /**
   * Get messages with attachments and reactions
   */
  static async getEnhancedMessages(
    bugReportId: string
  ): Promise<EnhancedBugReportMessage[]> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: messages, error } = await supabase
        .from('bug_report_messages')
        .select(`
          *,
          user:auth.users(id, email, raw_user_meta_data),
          attachments:bug_report_message_attachments(*),
          reactions:bug_report_message_metadata(*)
        `)
        .eq('bug_report_id', bugReportId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return messages || [];
    } catch (error) {
      console.error('[messaging] Error fetching enhanced messages:', error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  static async addReaction(
    messageId: string,
    emoji: string
  ): Promise<MessageReaction> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('bug_report_message_metadata')
        .insert([{
          message_id: messageId,
          user_id: user.id,
          type: 'reaction',
          value: emoji
        }])
        .select()
        .single();

      if (error) throw error;

      console.log(`[messaging] Added reaction to message ${messageId}`);
      return data;
    } catch (error) {
      console.error('[messaging] Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * Remove reaction from message
   */
  static async removeReaction(reactionId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { error } = await supabase
        .from('bug_report_message_metadata')
        .delete()
        .eq('id', reactionId);

      if (error) throw error;

      console.log(`[messaging] Removed reaction ${reactionId}`);
    } catch (error) {
      console.error('[messaging] Error removing reaction:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  static async markAsRead(messageId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('bug_report_message_metadata')
        .upsert({
          message_id: messageId,
          user_id: user.id,
          type: 'read'
        }, {
          onConflict: 'message_id,user_id,type'
        });

      if (error) throw error;
    } catch (error) {
      console.error('[messaging] Error marking as read:', error);
      throw error;
    }
  }

  /**
   * Set typing indicator
   */
  static async setTyping(bugReportId: string, isTyping: boolean): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      if (isTyping) {
        await supabase
          .from('bug_report_typing')
          .upsert({
            bug_report_id: bugReportId,
            user_id: user.id,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'bug_report_id,user_id'
          });
      } else {
        await supabase
          .from('bug_report_typing')
          .delete()
          .eq('bug_report_id', bugReportId)
          .eq('user_id', user.id);
      }
    } catch (error) {
      console.error('[messaging] Error setting typing indicator:', error);
      throw error;
    }
  }
}
```

**Testing Checklist:**
- [ ] Test sending message with attachments
- [ ] Test file upload to storage
- [ ] Test fetching enhanced messages
- [ ] Test adding/removing reactions
- [ ] Test marking messages as read
- [ ] Test typing indicators

---

### Layer 3: Hooks Layer (60-75 minutes)

#### 1. `apps/platform/hooks/messaging/use-realtime-messages.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { MessagingService } from '@/lib/services/messaging/messaging-service';
import type { EnhancedBugReportMessage } from '@your-org/shared/types/messaging';

export function useRealtimeMessages(bugReportId: string) {
  const [messages, setMessages] = useState<EnhancedBugReportMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setLoading(true);
        const data = await MessagingService.getEnhancedMessages(bugReportId);
        setMessages(data);
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [bugReportId]);

  // Subscribe to real-time updates
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel(`bug_messages:${bugReportId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bug_report_messages',
          filter: `bug_report_id=eq.${bugReportId}`
        },
        async (payload) => {
          // Fetch full message with user data
          const { data } = await supabase
            .from('bug_report_messages')
            .select(`
              *,
              user:auth.users(id, email, raw_user_meta_data),
              attachments:bug_report_message_attachments(*),
              reactions:bug_report_message_metadata(*)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev, data]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bug_report_messages',
          filter: `bug_report_id=eq.${bugReportId}`
        },
        async (payload) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'bug_report_messages',
          filter: `bug_report_id=eq.${bugReportId}`
        },
        (payload) => {
          setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bugReportId]);

  return {
    messages,
    loading
  };
}
```

#### 2. `apps/platform/hooks/messaging/use-typing-indicator.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { MessagingService } from '@/lib/services/messaging/messaging-service';
import type { TypingIndicator } from '@your-org/shared/types/messaging';

export function useTypingIndicator(bugReportId: string) {
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const supabase = createClientSupabaseClient();

  // Subscribe to typing indicators
  useEffect(() => {
    const channel = supabase
      .channel(`bug_typing:${bugReportId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bug_report_typing',
          filter: `bug_report_id=eq.${bugReportId}`
        },
        async () => {
          // Refetch typing users
          const { data } = await supabase
            .from('bug_report_typing')
            .select(`
              user_id,
              user:auth.users(email, raw_user_meta_data)
            `)
            .eq('bug_report_id', bugReportId)
            .gte('updated_at', new Date(Date.now() - 5000).toISOString()); // Last 5 seconds

          if (data) {
            setTypingUsers(
              data.map((item) => ({
                user_id: item.user_id,
                user_email: item.user.email,
                user_name: item.user.raw_user_meta_data?.full_name
              }))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bugReportId]);

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      await MessagingService.setTyping(bugReportId, isTyping);
    },
    [bugReportId]
  );

  return {
    typingUsers,
    setTyping
  };
}
```

#### 3. `apps/platform/hooks/messaging/use-message-reactions.ts`

```typescript
'use client';

import { useState } from 'react';
import { MessagingService } from '@/lib/services/messaging/messaging-service';
import { useToast } from '@/hooks/use-toast';

export function useMessageReactions() {
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const addReaction = async (messageId: string, emoji: string) => {
    try {
      setAdding(true);
      await MessagingService.addReaction(messageId, emoji);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add reaction';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      throw err;
    } finally {
      setAdding(false);
    }
  };

  const removeReaction = async (reactionId: string) => {
    try {
      await MessagingService.removeReaction(reactionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove reaction';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      throw err;
    }
  };

  return {
    addReaction,
    removeReaction,
    adding
  };
}
```

**Testing Checklist:**
- [ ] Test real-time message updates
- [ ] Test typing indicators
- [ ] Test reactions
- [ ] Verify subscriptions cleanup
- [ ] Test with multiple users

---

### Layer 4: Components Layer (90-120 minutes)

#### Key Components:

1. **`realtime-messages.tsx`** - Main message container with real-time updates
2. **`message-bubble.tsx`** - Individual message with reactions and attachments
3. **`message-reactions.tsx`** - Reaction picker and display
4. **`typing-indicator.tsx`** - Animated typing indicator
5. **`attachment-uploader.tsx`** - File upload component
6. **`message-input-enhanced.tsx`** - Input with file upload and @ mentions

**Component Example: Message Bubble**

```typescript
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageReactions } from './message-reactions';
import type { EnhancedBugReportMessage } from '@your-org/shared/types/messaging';
import { formatDistanceToNow } from 'date-fns';

interface MessageBubbleProps {
  message: EnhancedBugReportMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar>
        <AvatarImage src={message.user?.raw_user_meta_data?.avatar_url} />
        <AvatarFallback>
          {message.user?.email?.[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className={`flex-1 ${isOwn ? 'text-right' : ''}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {message.user?.raw_user_meta_data?.full_name || message.user?.email}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
        </div>

        <div className={`inline-block rounded-lg px-4 py-2 ${
          isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}>
          <p className="text-sm">{message.message}</p>

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline"
                >
                  {attachment.file_name}
                </a>
              ))}
            </div>
          )}
        </div>

        {message.reactions && message.reactions.length > 0 && (
          <MessageReactions messageId={message.id} reactions={message.reactions} />
        )}
      </div>
    </div>
  );
}
```

**Testing Checklist:**
- [ ] Test message display
- [ ] Test reactions display
- [ ] Test attachments
- [ ] Test typing indicator animation
- [ ] Test file upload
- [ ] Verify mobile responsiveness

---

### Layer 5: Integration (45-60 minutes)

Update the bug detail page to use real-time messages:

```typescript
// In bugs/[id]/page.tsx
import { useRealtimeMessages } from '@/hooks/messaging/use-realtime-messages';
import { useTypingIndicator } from '@/hooks/messaging/use-typing-indicator';
import { RealtimeMessages } from './_components/realtime-messages';

// Replace static messages with real-time component
<RealtimeMessages bugReportId={id} />
```

**Testing Checklist:**
- [ ] Test real-time updates work in bug detail page
- [ ] Test typing indicators
- [ ] Test reactions
- [ ] Test file attachments
- [ ] Verify performance with many messages

---

### Layer 6: Supabase Realtime Setup (30-40 minutes)

#### 1. Enable Realtime in Supabase Dashboard

```sql
-- Enable realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE bug_report_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE bug_report_typing;
ALTER PUBLICATION supabase_realtime ADD TABLE bug_report_message_metadata;
```

#### 2. Create Storage Bucket

In Supabase Dashboard:
- Create bucket: `bug-attachments`
- Set as public
- Configure file size limits (e.g., 10MB)
- Allowed MIME types: images, PDFs, text files

**Testing Checklist:**
- [ ] Verify realtime enabled
- [ ] Test storage bucket access
- [ ] Verify file upload works

---

## ✅ Completion Checklist

### Functionality
- [ ] Real-time messages work
- [ ] Typing indicators display
- [ ] Reactions can be added/removed
- [ ] File attachments upload and display
- [ ] Messages mark as read
- [ ] Multiple users can chat simultaneously

### Technical
- [ ] Realtime subscriptions cleanup properly
- [ ] No memory leaks
- [ ] Performance good with many messages
- [ ] File uploads secure
- [ ] Database migrations applied

### Integration
- [ ] Works seamlessly in bug detail page
- [ ] Mobile responsive
- [ ] Accessibility (keyboard navigation)
- [ ] Toast notifications work

---

## 🔧 Dependencies

**Required:**
1. ✅ Bug Reports Module
2. ✅ Supabase Realtime enabled
3. ✅ Supabase Storage configured

**Optional Enhancements:**
- Push notifications for new messages
- Message search
- Message editing/deletion
- Voice messages

---

## 📝 Notes

### Reuse from MyJKKN

Adapt from `app/(routes)/my-bug-reports/[id]/page.tsx`:
- Basic message display structure
- Message input component
- Timestamp formatting

### Performance Considerations

- Implement message pagination (load older messages)
- Cleanup old typing indicators (> 5 seconds)
- Optimize real-time subscriptions
- Lazy load attachments

### Future Enhancements

- Message threading/replies
- @ Mentions with autocomplete
- Rich text editing
- Code snippets with syntax highlighting
- Screen recording attachments

---

**Total Estimated Time:** 5-6 hours

**Status:** Ready for Implementation
**Note:** This module enhances the basic messaging from Bug Reports Module
