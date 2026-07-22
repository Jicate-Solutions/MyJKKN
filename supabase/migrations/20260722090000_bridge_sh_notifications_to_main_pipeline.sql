-- Updated: 2026-07-21 - Bridge sh_notifications into the main notification pipeline
--
-- WHY: Solutions Hub wrote its notifications to sh_notifications, a table read
-- only by /api/solutions/notifications. No bell, no push, no WhatsApp. Its four
-- real events (payment received, deliverable approved/revision requested,
-- assignment approved, MoU expiring) therefore reached nobody.
--
-- WHY A TRIGGER RATHER THAN APP CODE: the Solutions Hub service layer extends
-- BaseService, which uses the BROWSER (RLS-bound) Supabase client. The live
-- INSERT policy on public.notifications is `is_super_admin() OR is_admin()`,
-- and user_notifications INSERT is super-admin only. An app-side insert would
-- therefore be silently denied for exactly the staff who trigger these events —
-- recreating the silent-no-op bug class fixed in #2172 / #2168.
-- SECURITY DEFINER lets the bridge write regardless of caller role, and a
-- trigger catches every current AND future writer of sh_notifications for free.
--
-- Shape follows the #2172 canonical helper: body (not message), url, created_by
-- = anchor recipient, targeting.user_ids, kind='work_item' to keep these off the
-- /notifications/admin announcement surface.

CREATE OR REPLACE FUNCTION public.fn_bridge_sh_notification_to_main()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- The bridge must NEVER break the source write. If the main-pipeline insert
  -- fails, warn and let the sh_notifications row stand on its own.
  BEGIN
    INSERT INTO public.notifications (
      title, body, url, created_by, targeting, priority, category, kind, metadata
    )
    VALUES (
      NEW.title,
      COALESCE(NULLIF(NEW.message, ''), NEW.title),  -- notifications.body is NOT NULL
      NEW.action_url,
      NEW.user_id,                                    -- anchor recipient convention (#2172)
      jsonb_build_object('user_ids', jsonb_build_array(NEW.user_id)),
      COALESCE(NEW.priority, 'normal'),
      'solutions',
      'work_item',
      jsonb_build_object(
        'source', 'sh_notifications_bridge',
        'sh_notification_id', NEW.id,
        'sh_notification_type', NEW.notification_type
      )
    )
    RETURNING id INTO v_notification_id;

    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (v_notification_id, NEW.user_id);

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[sh_notifications bridge] % -> main pipeline failed: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Trigger functions are never invoked directly by a client, but the standing
-- rule (CLAUDE.md) is an explicit revoke on every new SECURITY DEFINER function:
-- Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE to anon separately
-- from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_bridge_sh_notification_to_main() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_bridge_sh_notification_to_main ON public.sh_notifications;
CREATE TRIGGER trg_bridge_sh_notification_to_main
  AFTER INSERT ON public.sh_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bridge_sh_notification_to_main();
