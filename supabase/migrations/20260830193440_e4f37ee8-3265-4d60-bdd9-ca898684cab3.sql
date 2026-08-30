REVOKE EXECUTE ON FUNCTION public.upsert_validated_count(uuid, text, uuid, numeric, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_validated_count(uuid, text, uuid, numeric, integer, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_validated_count(uuid, text, uuid, numeric, integer, text, uuid) TO service_role;