-- Minimal stand-ins for auth.uid(), profiles, api_keys, is_super_admin() and user_has_permission().
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, is_super_admin boolean DEFAULT false);
CREATE TABLE public.api_keys(id uuid PRIMARY KEY, user_id uuid, key_kind text NOT NULL DEFAULT 'admin', is_active boolean, expires_at timestamptz);
CREATE TABLE public.perms(user_id uuid, perm text);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce((SELECT is_super_admin FROM profiles WHERE id=auth.uid()),false) $$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM perms WHERE user_id=auth.uid() AND perm=permission_name) $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
INSERT INTO perms VALUES ('00000000-0000-0000-0000-00000000000a','meetings.view');
INSERT INTO api_keys VALUES
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','personal',true,now()+interval '30 days'),
 ('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','personal',true,now()+interval '30 days'),
 ('10000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-00000000000a','admin',true,now()+interval '30 days'),
 ('10000000-0000-0000-0000-0000000000ef','00000000-0000-0000-0000-00000000000a','personal',false,now()+interval '30 days');
