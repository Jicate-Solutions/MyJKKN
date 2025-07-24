-- Create notifications system tables

-- Table to store push notification subscriptions
CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.push_subscriptions IS 'Stores user push notification subscriptions';

-- Add index for faster lookups
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- Table to store notification content and targeting
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT, -- Optional URL to open on click
    icon TEXT, -- Optional icon URL
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    targeting JSONB NOT NULL, -- JSON object with targeting criteria
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.notifications IS 'Stores notification content and targeting information';

-- Add indexes for faster queries
CREATE INDEX idx_notifications_created_by ON public.notifications(created_by);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_priority ON public.notifications(priority);

-- Table to track which users received which notifications
CREATE TABLE public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(notification_id, user_id)
);

COMMENT ON TABLE public.user_notifications IS 'Tracks notification delivery and read status per user';

-- Add indexes for performance
CREATE INDEX idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX idx_user_notifications_notification_id ON public.user_notifications(notification_id);
CREATE INDEX idx_user_notifications_read_at ON public.user_notifications(read_at);
CREATE INDEX idx_user_notifications_created_at ON public.user_notifications(created_at DESC);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_push_subscriptions
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_notifications
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Enable Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_subscriptions
CREATE POLICY "Users can manage their own push subscriptions" ON public.push_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "Super admins can manage all notifications" ON public.notifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR p.is_super_admin = true)
        )
    );

-- RLS Policies for user_notifications
CREATE POLICY "Users can view their own notifications" ON public.user_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification read status" ON public.user_notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage all user notifications" ON public.user_notifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR p.is_super_admin = true)
        )
    );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.user_notifications TO authenticated; 