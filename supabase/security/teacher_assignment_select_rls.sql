-- SOLO PostgreSQL local descartable; ejecutar con psql -X -v ON_ERROR_STOP=1.
-- El runner reemplaza POLICY_UNDER_TEST por el bloque marcado del schema 08.
-- Todos los cambios de policy/fixture se revierten, incluso si una assertion falla.
BEGIN;
-- POLICY_UNDER_TEST
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.institutions WHERE id IN ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002')) THEN
    RAISE EXCEPTION 'FIXTURE_COLLISION';
  END IF;
END $$;
INSERT INTO public.institutions(id,name,slug) VALUES ('e1000000-0000-4000-8000-000000000001','RLS A','rls-teacher-local-a'),('e1000000-0000-4000-8000-000000000002','RLS B','rls-teacher-local-b');
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('e1000000-0000-4000-8000-000000000003','rls-teacher-u@example.invalid','{"account_role":"docente"}'),('e1000000-0000-4000-8000-000000000004','rls-teacher-v@example.invalid','{"account_role":"docente"}');
UPDATE public.profiles SET account_role='docente',is_blocked=false WHERE user_id IN ('e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004');
INSERT INTO public.memberships(institution_id,user_id,role) VALUES ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','viewer'),('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','viewer');
INSERT INTO public.teacher_records(id,institution_id,profile_id,workspace_key,full_name) VALUES ('e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','main','Teacher U'),('e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003','main','Teacher U foreign'),('e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','main','Teacher V');
INSERT INTO public.exam_tables(id,institution_id,exam_period_key,exam_call_key,exam_call_label,scheduled_starts_at,enrollment_opens_at,enrollment_closes_at,status) VALUES ('e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000001','QA','QA','QA',now()+interval '30 days',now()-interval '1 day',now()+interval '1 day','teacher_review'),('e1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000002','QA','QA','QA',now()+interval '30 days',now()-interval '1 day',now()+interval '1 day','teacher_review');
INSERT INTO public.exam_teacher_assignments(id,institution_id,exam_table_id,teacher_record_id,teacher_id,workspace_key,role,status) VALUES
('e1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000003','main','TITULAR','active'),
('e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000004','main','VOCAL_1','active'),
('e1000000-0000-4000-8000-000000000012','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000003','main','TITULAR','active'),
('e1000000-0000-4000-8000-000000000013','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000003','other','VOCAL_2','inactive'),
('e1000000-0000-4000-8000-000000000014','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000003','main','VOCAL_2','inactive'),
('e1000000-0000-4000-8000-000000000015','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000003','main','TITULAR','inactive');
CREATE FUNCTION pg_temp.expect_assignment(label text, target_id uuid, expected integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$ DECLARE actual integer; BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'TEST_MUST_USE_AUTHENTICATED'; END IF;
  SELECT count(*) INTO actual FROM public.exam_teacher_assignments WHERE id=target_id;
  IF actual <> expected THEN RAISE EXCEPTION '%: expected %, got %',label,expected,actual; END IF;
  RAISE NOTICE 'PASS % (% rows)',label,actual;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('own assignment','e1000000-0000-4000-8000-000000000010',1);
SELECT pg_temp.expect_assignment('same tenant other teacher','e1000000-0000-4000-8000-000000000011',0);
SELECT pg_temp.expect_assignment('foreign tenant same user without membership','e1000000-0000-4000-8000-000000000012',0);
SELECT pg_temp.expect_assignment('workspace mismatch','e1000000-0000-4000-8000-000000000013',0);
SELECT pg_temp.expect_assignment('record identity mismatch','e1000000-0000-4000-8000-000000000014',0);
SELECT pg_temp.expect_assignment('inactive own assignment','e1000000-0000-4000-8000-000000000015',1);
RESET ROLE;
DELETE FROM public.memberships WHERE institution_id='e1000000-0000-4000-8000-000000000001' AND user_id='e1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('no membership','e1000000-0000-4000-8000-000000000010',0);
RESET ROLE;
INSERT INTO public.memberships(institution_id,user_id,role) VALUES ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','viewer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('no membership restored','e1000000-0000-4000-8000-000000000010',1);
RESET ROLE;
UPDATE public.profiles SET is_blocked=true WHERE user_id='e1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('blocked profile','e1000000-0000-4000-8000-000000000010',0);
RESET ROLE;
UPDATE public.profiles SET is_blocked=false WHERE user_id='e1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('blocked profile restored','e1000000-0000-4000-8000-000000000010',1);
RESET ROLE;
UPDATE public.profiles SET account_role='alumno' WHERE user_id='e1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('non teacher profile','e1000000-0000-4000-8000-000000000010',0);
RESET ROLE;
UPDATE public.profiles SET account_role='docente' WHERE user_id='e1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('non teacher profile restored','e1000000-0000-4000-8000-000000000010',1);
RESET ROLE;
UPDATE public.institutions SET status='suspended' WHERE id='e1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('suspended institution','e1000000-0000-4000-8000-000000000010',0);
RESET ROLE;
UPDATE public.institutions SET status='active' WHERE id='e1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('suspended institution restored','e1000000-0000-4000-8000-000000000010',1);
RESET ROLE;
UPDATE public.teacher_records SET profile_id=NULL WHERE id='e1000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('unlinked record','e1000000-0000-4000-8000-000000000010',0);
RESET ROLE;
UPDATE public.teacher_records SET profile_id='e1000000-0000-4000-8000-000000000003' WHERE id='e1000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_assignment('unlinked record restored','e1000000-0000-4000-8000-000000000010',1);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.exam_teacher_assignments(institution_id,exam_table_id,teacher_record_id,teacher_id,role,status) VALUES ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000003','TITULAR','inactive');
    RAISE EXCEPTION 'INSERT_NOT_DENIED';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS INSERT denied'; END;
  BEGIN
    UPDATE public.exam_teacher_assignments SET confirmation_status='confirmed' WHERE id='e1000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'UPDATE_NOT_DENIED';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS UPDATE denied'; END;
  BEGIN
    DELETE FROM public.exam_teacher_assignments WHERE id='e1000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'DELETE_NOT_DENIED';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS DELETE denied'; END;
END $$;
SELECT pg_temp.expect_assignment('own assignment unchanged','e1000000-0000-4000-8000-000000000010',1);
RESET ROLE;
ROLLBACK;
