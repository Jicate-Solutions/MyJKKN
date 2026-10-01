-- Allow deleting master vacate checklist items.
-- Safe for requests already in flight: hostel_clearance_items keeps its own copy
-- of label / required flag, and checklist_item_id is ON DELETE SET NULL, so a
-- deleted master item only detaches from the history.
DROP POLICY IF EXISTS hvci_delete ON public.hostel_vacate_checklist_items;
CREATE POLICY hvci_delete ON public.hostel_vacate_checklist_items FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.vacate_checklist.manage'))
  );
