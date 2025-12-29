-- Add missing status 'critico' to task_statuses
INSERT INTO public.task_statuses (slug, label, is_final)
VALUES ('critico', 'Crítico', false)
ON CONFLICT (slug) DO NOTHING;