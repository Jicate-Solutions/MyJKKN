# UI Components: MyJKKN AI Query System

| Field | Detail |
|:------|:-------|
| **Version** | 1.0 |
| **Page Route** | /ai-query |
| **Components** | 10 |

---

## 1. Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MyJKKN                                           🔔  👤 Dr. Priya (HOD)  ⚙️ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📋 │                                                                        │
│ 📊 │  ┌─────────────────────────────────────────────────────────────────┐  │
│ 👥 │  │              🤖 AI Query Assistant                              │  │
│ 💰 │  │                                                                 │  │
│ 📅 │  │  ┌─────────────────────────────────────────────────────────┐   │  │
│ 📖 │  │  │ Context: Mechanical Engineering | JKKN CET | 2024-25    │   │  │
│ 🔧 │  │  └─────────────────────────────────────────────────────────┘   │  │
│ 📝 │  │                                                                 │  │
│ 🤖 │  │  ┌─────────────────────────────────────────────────────────┐   │  │
│ ◀️ │  │  │            💬 Message Thread Area                       │   │  │
│    │  │  │                    (Scrollable)                         │   │  │
│    │  │  │                                                          │   │  │
│    │  │  │  [MessageBubble - User]                                  │   │  │
│    │  │  │  [MessageBubble - Assistant with Table]                  │   │  │
│    │  │  │  [MessageBubble - User]                                  │   │  │
│    │  │  │  [MessageBubble - Assistant]                             │   │  │
│    │  │  │                                                          │   │  │
│    │  │  └─────────────────────────────────────────────────────────┘   │  │
│    │  │                                                                 │  │
│    │  │  ┌─────────────────────────────────────────────────────────┐   │  │
│    │  │  │ 💡 Suggested: "Fee defaulters" | "Today's schedule"     │   │  │
│    │  │  └─────────────────────────────────────────────────────────┘   │  │
│    │  │                                                                 │  │
│    │  │  ┌─────────────────────────────────────────────────────────┐   │  │
│    │  │  │ 🔍 Ask anything about your data...              [Send]  │   │  │
│    │  │  └─────────────────────────────────────────────────────────┘   │  │
│    │  │                                                                 │  │
│    │  └─────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Tree

```
app/(routes)/ai-query/
├── page.tsx                     # Server component - auth check, initial data
└── _components/
    ├── AIQueryContainer.tsx     # Main client container, state management
    ├── ContextBanner.tsx        # User context display bar
    ├── MessageThread.tsx        # Scrollable message list
    ├── MessageBubble.tsx        # Individual message (user/assistant)
    ├── QueryResultTable.tsx     # Data table in responses
    ├── ActionButtons.tsx        # Action buttons under results
    ├── ActionConfirmModal.tsx   # Confirmation dialogs
    ├── SuggestedQueries.tsx     # Role-based query suggestions
    ├── QueryInput.tsx           # Input field with send button
    └── LoadingIndicator.tsx     # Streaming/processing indicator
```

---

## 3. Component Specifications

### 3.1 AIQueryContainer.tsx

Main container managing all state and API calls.

```typescript
// Types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: QueryResultData;
  actions?: ActionDefinition[];
  timestamp: Date;
  isStreaming?: boolean;
}

interface QueryResultData {
  type: 'table' | 'text' | 'chart';
  columns?: string[];
  rows?: any[][];
  summary?: string;
}

interface ActionDefinition {
  id: string;
  label: string;
  tier: 1 | 2 | 3 | 4;
  parameters_required?: string[];
  confirmation_message?: string;
}

// Component
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAIQuery } from '@/hooks/use-ai-query';
import { ContextBanner } from './ContextBanner';
import { MessageThread } from './MessageThread';
import { SuggestedQueries } from './SuggestedQueries';
import { QueryInput } from './QueryInput';
import { ActionConfirmModal } from './ActionConfirmModal';

export function AIQueryContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingAction, setPendingAction] = useState<ActionDefinition | null>(null);
  const [actionData, setActionData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { submitQuery, executeAction, isLoading, userContext } = useAIQuery();

  const handleSubmit = async (query: string) => {
    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Add placeholder for assistant
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };
    setMessages(prev => [...prev, assistantMessage]);

    // Stream response
    await submitQuery(query, {
      onToken: (token) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content += token;
          }
          return updated;
        });
      },
      onComplete: (result) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.isStreaming = false;
            lastMsg.data = result.data;
            lastMsg.actions = result.actions;
          }
          return updated;
        });
      }
    });
  };

  const handleActionClick = (action: ActionDefinition, data: any) => {
    if (action.tier === 1) {
      // Auto-execute
      executeAction(action.id, data);
    } else if (action.tier <= 3) {
      // Show confirmation
      setPendingAction(action);
      setActionData(data);
    } else {
      // Blocked - show message
      alert('This action requires administrator access. Please contact your admin.');
    }
  };

  const handleActionConfirm = async () => {
    if (pendingAction && actionData) {
      await executeAction(pendingAction.id, actionData);
      setPendingAction(null);
      setActionData(null);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <ContextBanner context={userContext} />

      <MessageThread
        messages={messages}
        onActionClick={handleActionClick}
        isLoading={isLoading}
      />
      <div ref={messagesEndRef} />

      <SuggestedQueries
        role={userContext?.role}
        onSelect={handleSubmit}
      />

      <QueryInput
        onSubmit={handleSubmit}
        disabled={isLoading}
      />

      <ActionConfirmModal
        action={pendingAction}
        data={actionData}
        onConfirm={handleActionConfirm}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
```

### 3.2 ContextBanner.tsx

Displays user's current context.

```typescript
interface ContextBannerProps {
  context: UserContext | null;
}

export function ContextBanner({ context }: ContextBannerProps) {
  if (!context) return null;

  return (
    <div className="bg-muted/50 border-b px-4 py-2 text-sm flex items-center gap-2">
      <span className="text-muted-foreground">Context:</span>
      <span className="font-medium">{context.department_name || 'All Departments'}</span>
      <span className="text-muted-foreground">|</span>
      <span className="font-medium">{context.institution_name}</span>
      <span className="text-muted-foreground">|</span>
      <span className="font-medium">{context.current_academic_year}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        Role: {context.role}
      </span>
    </div>
  );
}
```

### 3.3 MessageBubble.tsx

Individual message display with data and actions.

```typescript
interface MessageBubbleProps {
  message: Message;
  onActionClick: (action: ActionDefinition, data: any) => void;
}

export function MessageBubble({ message, onActionClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn(
      "flex w-full mb-4",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[80%] rounded-lg px-4 py-3",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-muted"
      )}>
        {/* Avatar */}
        <div className="flex items-center gap-2 mb-2">
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
          <span className="text-xs font-medium">
            {isUser ? 'You' : 'Assistant'}
          </span>
          {message.isStreaming && (
            <span className="animate-pulse">...</span>
          )}
        </div>

        {/* Content */}
        <div className="prose prose-sm dark:prose-invert">
          {message.content}
        </div>

        {/* Data Table */}
        {message.data?.type === 'table' && (
          <QueryResultTable data={message.data} />
        )}

        {/* Actions */}
        {message.actions && message.actions.length > 0 && (
          <ActionButtons
            actions={message.actions}
            data={message.data}
            onActionClick={onActionClick}
          />
        )}

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground mt-2">
          {format(message.timestamp, 'HH:mm')}
        </div>
      </div>
    </div>
  );
}
```

### 3.4 QueryResultTable.tsx

Displays tabular data in responses.

```typescript
interface QueryResultTableProps {
  data: {
    columns: string[];
    rows: any[][];
  };
}

export function QueryResultTable({ data }: QueryResultTableProps) {
  if (!data.columns || !data.rows) return null;

  return (
    <div className="mt-3 border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {data.columns.map((col, i) => (
              <TableHead key={i}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.slice(0, 10).map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.rows.length > 10 && (
        <div className="text-center py-2 text-sm text-muted-foreground border-t">
          Showing 10 of {data.rows.length} rows
        </div>
      )}
    </div>
  );
}
```

### 3.5 ActionButtons.tsx

Action buttons displayed under query results.

```typescript
interface ActionButtonsProps {
  actions: ActionDefinition[];
  data: any;
  onActionClick: (action: ActionDefinition, data: any) => void;
}

export function ActionButtons({ actions, data, onActionClick }: ActionButtonsProps) {
  const getTierIcon = (tier: number) => {
    switch (tier) {
      case 1: return <Download className="h-4 w-4" />;
      case 2: return <Send className="h-4 w-4" />;
      case 3: return <AlertTriangle className="h-4 w-4" />;
      default: return <Lock className="h-4 w-4" />;
    }
  };

  const getTierVariant = (tier: number) => {
    switch (tier) {
      case 1: return 'outline';
      case 2: return 'secondary';
      case 3: return 'destructive';
      default: return 'ghost';
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
      {actions.map((action) => (
        <Button
          key={action.id}
          variant={getTierVariant(action.tier)}
          size="sm"
          onClick={() => onActionClick(action, data)}
          disabled={action.tier === 4}
        >
          {getTierIcon(action.tier)}
          <span className="ml-2">{action.label}</span>
        </Button>
      ))}
    </div>
  );
}
```

### 3.6 ActionConfirmModal.tsx

Confirmation dialog for Tier 2-3 actions.

```typescript
interface ActionConfirmModalProps {
  action: ActionDefinition | null;
  data: any;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActionConfirmModal({
  action,
  data,
  onConfirm,
  onCancel
}: ActionConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('');

  if (!action) return null;

  const isTier3 = action.tier === 3;
  const recipientCount = data?.data?.length || 0;
  const confirmRequired = isTier3 ? 'SEND TO ALL' : null;

  return (
    <Dialog open={!!action} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogDescription>
            {action.confirmation_message || `Are you sure you want to ${action.label.toLowerCase()}?`}
          </DialogDescription>
        </DialogHeader>

        {isTier3 && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will affect {recipientCount} recipients.
              </AlertDescription>
            </Alert>

            <div>
              <Label>Type "{confirmRequired}" to confirm:</Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmRequired}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isTier3 && confirmText !== confirmRequired}
          >
            {isTier3 ? `Yes, ${action.label}` : action.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.7 SuggestedQueries.tsx

Role-based query suggestions.

```typescript
const SUGGESTIONS_BY_ROLE: Record<string, string[]> = {
  learner: [
    "What's my attendance this semester?",
    "Show my pending fees",
    "What's my timetable today?",
    "Show my grades"
  ],
  faculty: [
    "Show attendance defaulters in my classes",
    "Which students missed last 3 classes?",
    "Show my teaching schedule",
    "List students with incomplete assignments"
  ],
  hod: [
    "Department attendance summary",
    "Fee defaulters in my department",
    "Staff workload distribution",
    "Students at risk in my department"
  ],
  admin: [
    "Institution-wide fee collection status",
    "Overall attendance trends",
    "Admission statistics",
    "Resource utilization report"
  ],
  super_admin: [
    "Cross-institution comparison",
    "System-wide metrics",
    "User activity summary",
    "All pending approvals"
  ]
};

interface SuggestedQueriesProps {
  role: string;
  onSelect: (query: string) => void;
}

export function SuggestedQueries({ role, onSelect }: SuggestedQueriesProps) {
  const suggestions = SUGGESTIONS_BY_ROLE[role] || SUGGESTIONS_BY_ROLE.learner;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 bg-muted/30">
      <span className="text-xs text-muted-foreground mr-2">Suggested:</span>
      {suggestions.map((suggestion, i) => (
        <Button
          key={i}
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
```

### 3.8 QueryInput.tsx

Input field with send button.

```typescript
interface QueryInputProps {
  onSubmit: (query: string) => void;
  disabled?: boolean;
}

export function QueryInput({ onSubmit, disabled }: QueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onSubmit(query.trim());
      setQuery('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your data..."
          disabled={disabled}
          className="flex-1"
        />
        <Button type="submit" disabled={disabled || !query.trim()}>
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
```

---

## 4. Hook: useAIQuery

```typescript
// hooks/use-ai-query.ts
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: QueryResult) => void;
}

export function useAIQuery() {
  const [isLoading, setIsLoading] = useState(false);

  // Fetch user context
  const { data: userContext } = useQuery({
    queryKey: ['ai-query-context'],
    queryFn: async () => {
      const res = await fetch('/api/ai-query/context');
      return res.json();
    }
  });

  // Submit query with streaming
  const submitQuery = async (query: string, callbacks: StreamCallbacks) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let result: QueryResult = { data: null, actions: [] };

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'text_delta') {
              callbacks.onToken(data.content);
            } else if (data.type === 'result') {
              result = {
                data: data.data,
                actions: data.actions
              };
            }
          }
        }
      }

      callbacks.onComplete(result);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute action
  const executeAction = async (actionId: string, data: any) => {
    const response = await fetch('/api/ai-query/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, data, confirmation: true })
    });

    return response.json();
  };

  return {
    submitQuery,
    executeAction,
    isLoading,
    userContext
  };
}
```

---

## 5. Styling Guidelines

### Color Scheme (following existing MyJKKN design)

- User messages: `bg-primary` (brand blue)
- Assistant messages: `bg-muted` (gray)
- Action buttons: Follow tier color coding
- Tables: `border` with `bg-card` rows

### Responsive Breakpoints

- Mobile (<640px): Full width, stacked layout
- Tablet (640-1024px): 90% width centered
- Desktop (>1024px): 80% max-width with sidebar

### Animations

- Message entry: `fade-in` + `slide-up`
- Streaming text: Cursor blink animation
- Button hover: Scale + shadow transitions
