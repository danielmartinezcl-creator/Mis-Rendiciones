-- Traspasos entre fondos/cargas históricas de empleados diferentes
-- Un fondo puede traspasar saldo a otro empleado antes de que el fondo receptor exista.
-- El receptor queda con un "saldo flotante" hasta que se vincule a un fondo/reporte concreto.

-- 1. Tabla principal de traspasos
CREATE TABLE public.fund_transfers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date                 DATE        NOT NULL,
  amount               NUMERIC     NOT NULL CHECK (amount > 0),
  description          TEXT,

  -- Quien paga (empleado siempre requerido; fondo O reporte histórico)
  payer_employee_id    UUID        NOT NULL REFERENCES public.users(id),
  payer_fund_id        UUID        REFERENCES public.petty_cash_funds(id),
  payer_report_id      UUID        REFERENCES public.expense_reports(id),

  -- Quien recibe (empleado siempre requerido; fondo/reporte se llena al vincular)
  receiver_employee_id UUID        NOT NULL REFERENCES public.users(id),
  receiver_fund_id     UUID        REFERENCES public.petty_cash_funds(id),
  receiver_report_id   UUID        REFERENCES public.expense_reports(id),

  -- Estado del matching
  matched              BOOLEAN     NOT NULL DEFAULT FALSE,
  matched_at           TIMESTAMPTZ,

  created_by           UUID        NOT NULL REFERENCES public.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Al menos una fuente pagadora
  CONSTRAINT chk_payer_source CHECK (
    payer_fund_id IS NOT NULL OR payer_report_id IS NOT NULL
  )
);

-- 2. RLS
ALTER TABLE public.fund_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_read_fund_transfers" ON public.fund_transfers
  FOR SELECT USING (org_id = get_my_org_id());

CREATE POLICY "admin_manage_fund_transfers" ON public.fund_transfers
  FOR ALL
  USING (is_admin() AND org_id = get_my_org_id())
  WITH CHECK (is_admin() AND org_id = get_my_org_id());

-- 3. Índices
CREATE INDEX idx_fund_transfers_org      ON public.fund_transfers (org_id);
CREATE INDEX idx_fund_transfers_receiver ON public.fund_transfers (receiver_employee_id, matched);
CREATE INDEX idx_fund_transfers_payer    ON public.fund_transfers (payer_employee_id);

-- 4. Agregar transfer_id a expense_items (cargas históricas)
ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.fund_transfers(id);

-- Actualizar CHECK constraint de item_type para incluir 'transfer'
ALTER TABLE public.expense_items
  DROP CONSTRAINT IF EXISTS expense_items_item_type_check;

ALTER TABLE public.expense_items
  ADD CONSTRAINT expense_items_item_type_check
  CHECK (item_type IN ('expense', 'advance', 'return', 'transfer'));

-- 5. Agregar transfer_id a petty_cash_items (fondos activos)
ALTER TABLE public.petty_cash_items
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.fund_transfers(id);

COMMENT ON TABLE  public.fund_transfers IS 'Traspasos de saldo entre cajas chicas de distintos empleados';
COMMENT ON COLUMN public.fund_transfers.matched IS 'TRUE cuando el receptor ya vinculó el traspaso a un fondo o carga histórica';
COMMENT ON COLUMN public.fund_transfers.payer_fund_id IS 'Fondo activo de origen (null si el pago viene de carga histórica)';
COMMENT ON COLUMN public.fund_transfers.payer_report_id IS 'Carga histórica de origen (null si el pago viene de fondo activo)';
COMMENT ON COLUMN public.fund_transfers.receiver_fund_id IS 'Fondo activo destino — null hasta que se vincule';
COMMENT ON COLUMN public.fund_transfers.receiver_report_id IS 'Carga histórica destino — null hasta que se vincule';
