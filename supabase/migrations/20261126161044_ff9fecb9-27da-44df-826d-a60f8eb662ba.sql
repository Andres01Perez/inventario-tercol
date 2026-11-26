CREATE TABLE public.cost_update_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES public.inventories(id),
  referencia TEXT NOT NULL,
  material_type public.material_type NOT NULL,
  costo_u_anterior NUMERIC,
  costo_u_nuevo NUMERIC NOT NULL,
  costo_t_anterior NUMERIC,
  costo_t_nuevo NUMERIC NOT NULL,
  batch_id UUID NOT NULL,
  file_name TEXT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_update_history_inv_type_date
  ON public.cost_update_history (inventory_id, material_type, created_at DESC);

CREATE INDEX idx_cost_update_history_inv_ref
  ON public.cost_update_history (inventory_id, referencia);

GRANT SELECT ON public.cost_update_history TO authenticated;
GRANT ALL ON public.cost_update_history TO service_role;

ALTER TABLE public.cost_update_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin and viewer can read cost update history"
  ON public.cost_update_history
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_viewer(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_master_costs(
  _inventory_id UUID,
  _material_type public.material_type,
  _items JSONB,
  _file_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _inv_status TEXT;
  _batch_id UUID := gen_random_uuid();
  _item JSONB;
  _ref_norm TEXT;
  _new_u NUMERIC;
  _rec RECORD;
  _old_u NUMERIC;
  _old_t NUMERIC;
  _qty NUMERIC;
  _new_t NUMERIC;
  _updated INT := 0;
  _unchanged INT := 0;
  _not_found INT := 0;
BEGIN
  IF _uid IS NULL OR NOT public.is_superadmin(_uid) THEN
    RAISE EXCEPTION 'Solo el superadmin puede actualizar costos';
  END IF;

  IF _material_type NOT IN ('MP', 'PP') THEN
    RAISE EXCEPTION 'Solo se permite actualizar costos de MP o PP';
  END IF;

  SELECT status INTO _inv_status
  FROM public.inventories
  WHERE id = _inventory_id;

  IF _inv_status IS NULL THEN
    RAISE EXCEPTION 'Inventario no encontrado';
  END IF;

  IF _inv_status = 'cerrado' THEN
    RAISE EXCEPTION 'El inventario está cerrado y no permite modificaciones';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'Lista de costos inválida';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _ref_norm := upper(trim(COALESCE(_item->>'referencia', '')));
    IF _ref_norm = '' THEN
      CONTINUE;
    END IF;

    _new_u := (_item->>'costo_u')::NUMERIC;
    IF _new_u IS NULL OR _new_u < 0 THEN
      RAISE EXCEPTION 'Costo inválido para la referencia %', _ref_norm;
    END IF;

    SELECT
      referencia,
      costo_u_mp,
      costo_u_pp,
      costo_t,
      cant_t_mp,
      cant_total_pp
    INTO _rec
    FROM public.inventory_master
    WHERE inventory_id = _inventory_id
      AND material_type = _material_type
      AND upper(trim(referencia)) = _ref_norm
    LIMIT 1;

    IF NOT FOUND THEN
      _not_found := _not_found + 1;
      CONTINUE;
    END IF;

    IF _material_type = 'MP' THEN
      _old_u := _rec.costo_u_mp;
      _qty := COALESCE(_rec.cant_t_mp, 0);
    ELSE
      _old_u := _rec.costo_u_pp;
      _qty := COALESCE(_rec.cant_total_pp, 0);
    END IF;

    _old_t := _rec.costo_t;
    _new_t := _qty * _new_u;

    IF _old_u IS NOT DISTINCT FROM _new_u AND _old_t IS NOT DISTINCT FROM _new_t THEN
      _unchanged := _unchanged + 1;
      CONTINUE;
    END IF;

    IF _material_type = 'MP' THEN
      UPDATE public.inventory_master
      SET costo_u_mp = _new_u,
          costo_t = _new_t,
          updated_at = now()
      WHERE inventory_id = _inventory_id
        AND referencia = _rec.referencia;
    ELSE
      UPDATE public.inventory_master
      SET costo_u_pp = _new_u,
          costo_t = _new_t,
          updated_at = now()
      WHERE inventory_id = _inventory_id
        AND referencia = _rec.referencia;
    END IF;

    INSERT INTO public.cost_update_history (
      inventory_id,
      referencia,
      material_type,
      costo_u_anterior,
      costo_u_nuevo,
      costo_t_anterior,
      costo_t_nuevo,
      batch_id,
      file_name,
      updated_by
    ) VALUES (
      _inventory_id,
      _rec.referencia,
      _material_type,
      _old_u,
      _new_u,
      _old_t,
      _new_t,
      _batch_id,
      _file_name,
      _uid
    );

    _updated := _updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'updated', _updated,
    'unchanged', _unchanged,
    'not_found', _not_found
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_master_costs(UUID, public.material_type, JSONB, TEXT) TO authenticated;