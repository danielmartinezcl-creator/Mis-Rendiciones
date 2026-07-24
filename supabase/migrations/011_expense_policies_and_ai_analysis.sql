-- 011_expense_policies_and_ai_analysis.sql

-- 1. Tabla expense_policies
CREATE TABLE public.expense_policies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  category_id           uuid REFERENCES expense_categories(id),
  department            text,
  target_user_id        uuid REFERENCES users(id),
  item_limit            numeric,
  item_enforcement      text CHECK (item_enforcement IN ('warn','require_justification','block')),
  monthly_limit         numeric,
  monthly_enforcement   text CHECK (monthly_enforcement IN ('warn','require_justification','block')),
  quarterly_limit       numeric,
  quarterly_enforcement text CHECK (quarterly_enforcement IN ('warn','require_justification','block')),
  annual_limit          numeric,
  annual_enforcement    text CHECK (annual_enforcement IN ('warn','require_justification','block')),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_policies" ON public.expense_policies
  FOR ALL
  USING (is_admin() AND org_id = get_my_org_id())
  WITH CHECK (is_admin() AND org_id = get_my_org_id());

CREATE POLICY "employees_read_org_policies" ON public.expense_policies
  FOR SELECT
  USING (org_id = get_my_org_id());

CREATE INDEX idx_expense_policies_org      ON public.expense_policies(org_id, is_active);
CREATE INDEX idx_expense_policies_category ON public.expense_policies(category_id);

-- 2. Nuevas columnas en expense_items
ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS policy_justification text,
  ADD COLUMN IF NOT EXISTS policy_violations     jsonb;

-- 3. Nuevas columnas en expense_reports
ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS ai_analysis    jsonb,
  ADD COLUMN IF NOT EXISTS ai_analysis_at timestamptz;
