-- ============================================================
-- 011_bank_authorization_workflow.sql
-- Flujo de autorización bancaria en Caja Chica y Rendiciones
-- Aplicado: 2026-07-28
-- Proyecto: jqtbtgduqzxkgubmzukg (Rindegastos PENTA)
-- ============================================================

-- 1. Nuevas columnas de permiso bancario en users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_load_bank_transfer     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_authorize_bank_transfer boolean NOT NULL DEFAULT false;

-- 2. petty_cash_funds: ampliar status con pasos bancarios
ALTER TABLE public.petty_cash_funds
  DROP CONSTRAINT petty_cash_funds_status_check;

ALTER TABLE public.petty_cash_funds
  ADD CONSTRAINT petty_cash_funds_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'pending_approval', 'approved',
    'pending_bank_load', 'pending_bank_auth',
    'funds_sent', 'submitted', 'pending_liquidation_approval', 'settled', 'rejected'
  ]));

-- 3. petty_cash_approvals: ampliar action con acciones bancarias
ALTER TABLE public.petty_cash_approvals
  DROP CONSTRAINT petty_cash_approvals_action_check;

ALTER TABLE public.petty_cash_approvals
  ADD CONSTRAINT petty_cash_approvals_action_check
  CHECK (action = ANY (ARRAY[
    'created', 'submitted_for_approval', 'approved', 'rejected',
    'bank_load_requested', 'bank_load_confirmed', 'bank_authorized',
    'funds_sent', 'liquidation_submitted', 'liquidation_elevated',
    'liquidation_approved', 'settled'
  ]));

-- 4. expense_reports: ampliar status con pasos bancarios
ALTER TABLE public.expense_reports
  DROP CONSTRAINT expense_reports_status_check;

ALTER TABLE public.expense_reports
  ADD CONSTRAINT expense_reports_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'submitted', 'pending_l2', 'approved', 'partially_approved',
    'rejected', 'reimbursed',
    'pending_bank_load', 'pending_bank_auth'
  ]));

-- 5. expense_report_approvals: ampliar action con acciones bancarias
ALTER TABLE public.expense_report_approvals
  DROP CONSTRAINT expense_report_approvals_action_check;

ALTER TABLE public.expense_report_approvals
  ADD CONSTRAINT expense_report_approvals_action_check
  CHECK (action = ANY (ARRAY[
    'approved', 'rejected', 'partially_approved', 'returned_to_draft',
    'bank_load_requested', 'bank_load_confirmed', 'bank_authorized'
  ]));
