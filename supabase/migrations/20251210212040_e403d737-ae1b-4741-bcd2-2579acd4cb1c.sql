-- =============================================
-- POLÍTICAS RLS
-- =============================================

-- task_statuses: catálogo público
CREATE POLICY "Authenticated users can view statuses"
  ON public.task_statuses FOR SELECT TO authenticated
  USING (true);

-- operarios: catálogo con gestión por admin
CREATE POLICY "Authenticated users can view active operarios"
  ON public.operarios FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert operarios"
  ON public.operarios FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update operarios"
  ON public.operarios FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete operarios"
  ON public.operarios FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inventory_master: admin full access, supervisor limited
CREATE POLICY "Admins can select all inventory"
  ON public.inventory_master FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert inventory"
  ON public.inventory_master FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update inventory"
  ON public.inventory_master FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete inventory"
  ON public.inventory_master FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors can view assigned inventory"
  ON public.inventory_master FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor') AND
    EXISTS (
      SELECT 1 FROM public.count_tasks 
      WHERE master_reference = reference 
      AND assigned_supervisor_id = auth.uid()
    )
  );

-- count_tasks: admin full access, supervisor own tasks
CREATE POLICY "Admins can select all tasks"
  ON public.count_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert tasks"
  ON public.count_tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tasks"
  ON public.count_tasks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tasks"
  ON public.count_tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors can view own tasks"
  ON public.count_tasks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor') AND
    assigned_supervisor_id = auth.uid()
  );

CREATE POLICY "Supervisors can update own tasks"
  ON public.count_tasks FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor') AND
    assigned_supervisor_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor') AND
    assigned_supervisor_id = auth.uid()
  );

-- audit_logs: solo admins ven, todos pueden insertar sus propios
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- FUNCIÓN DE VALIDACIÓN Y CIERRE DE RONDA
-- =============================================
CREATE OR REPLACE FUNCTION public.validate_and_close_round(
  _reference TEXT,
  _admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master RECORD;
  v_sum_counted NUMERIC;
  v_previous_sum NUMERIC;
  v_result JSONB;
  v_history_array JSONB;
BEGIN
  SELECT * INTO v_master FROM inventory_master WHERE reference = _reference;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referencia no encontrada');
  END IF;
  
  SELECT COALESCE(SUM(quantity_counted), 0) INTO v_sum_counted
  FROM count_tasks 
  WHERE master_reference = _reference AND audit_round = v_master.audit_round;
  
  IF v_master.audit_round > 1 AND jsonb_array_length(v_master.count_history) >= v_master.audit_round - 1 THEN
    v_previous_sum := (v_master.count_history->(v_master.audit_round - 2)->>'sum')::numeric;
  ELSE
    v_previous_sum := NULL;
  END IF;
  
  IF v_sum_counted = v_master.erp_target_qty THEN
    v_history_array := v_master.count_history || jsonb_build_object('round', v_master.audit_round, 'sum', v_sum_counted);
    UPDATE inventory_master 
    SET status_slug = 'auditado', count_history = v_history_array
    WHERE reference = _reference;
    v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'matches_erp', 'counted', v_sum_counted, 'erp', v_master.erp_target_qty);
    
  ELSIF v_master.audit_round > 1 AND v_previous_sum IS NOT NULL AND v_sum_counted = v_previous_sum THEN
    v_history_array := v_master.count_history || jsonb_build_object('round', v_master.audit_round, 'sum', v_sum_counted);
    UPDATE inventory_master 
    SET status_slug = 'auditado', count_history = v_history_array
    WHERE reference = _reference;
    v_result := jsonb_build_object('success', true, 'action', 'closed', 'reason', 'physical_consistency', 'counted', v_sum_counted);
    
  ELSIF v_master.audit_round >= 5 THEN
    v_history_array := v_master.count_history || jsonb_build_object('round', 5, 'sum', v_sum_counted, 'forced', true);
    UPDATE inventory_master 
    SET status_slug = 'cerrado_forzado', count_history = v_history_array
    WHERE reference = _reference;
    v_result := jsonb_build_object('success', true, 'action', 'forced_close', 'reason', 'round_5_strict', 'counted', v_sum_counted);
    
  ELSE
    v_history_array := v_master.count_history || jsonb_build_object('round', v_master.audit_round, 'sum', v_sum_counted);
    UPDATE inventory_master 
    SET audit_round = v_master.audit_round + 1, status_slug = 'conflicto', count_history = v_history_array
    WHERE reference = _reference;
    
    UPDATE count_tasks 
    SET quantity_counted = 0, is_completed = false, audit_round = v_master.audit_round + 1
    WHERE master_reference = _reference;
    
    IF v_master.audit_round = 4 THEN
      v_result := jsonb_build_object('success', true, 'action', 'prepare_strict', 'new_round', 5, 'message', 'Requiere conteo estricto por Admin');
    ELSE
      v_result := jsonb_build_object('success', true, 'action', 'next_round', 'new_round', v_master.audit_round + 1);
    END IF;
  END IF;
  
  INSERT INTO audit_logs (master_reference, user_id, action_type, round_number, new_data)
  VALUES (_reference, _admin_id, v_result->>'action', v_master.audit_round, v_result);
  
  RETURN v_result;
END;
$$;