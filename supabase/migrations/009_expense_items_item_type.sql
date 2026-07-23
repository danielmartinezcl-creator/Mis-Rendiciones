-- Agrega item_type a expense_items para soportar adelantos y devoluciones
-- expense = gasto normal, advance = adelanto empresa→empleado, return = devolución empleado→empresa
ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'expense'
  CHECK (item_type IN ('expense', 'advance', 'return'));

COMMENT ON COLUMN public.expense_items.item_type IS
  'expense = gasto normal, advance = adelanto empresa→empleado, return = devolución empleado→empresa';
