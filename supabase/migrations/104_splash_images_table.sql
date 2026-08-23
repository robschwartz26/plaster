-- Migration 104: splash rotation gets per-image Live/Hidden control.
-- The table (not the storage folder) is now the source of truth for the
-- rotation. Bundled originals get rows too so they can be hidden/revealed
-- like any upload. Public readers only ever see active rows; admins see and
-- manage everything. New uploads default to hidden (active=false) so Rob
-- releases them deliberately.
CREATE TABLE public.splash_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  is_bundled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.splash_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_active_splash" ON public.splash_images
  FOR SELECT USING (active);

CREATE POLICY "admin_manage_splash" ON public.splash_images
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.splash_images (url, is_bundled, active) VALUES
  ('/newsplash-1.png', true, true),
  ('/newsplash-2.png', true, true),
  ('/newsplash-3.png', true, true),
  ('/newsplash-4.png', true, true),
  ('/newsplash-5.png', true, true),
  ('/newsplash-6.png', true, true);
