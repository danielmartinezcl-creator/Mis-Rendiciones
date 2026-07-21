// Tipos generados del schema de Supabase
// Para regenerar: npx supabase gen types typescript --project-id jqtbtgduqzxkgubmzukg > src/lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          country: string
          currency: string
          plan: 'free' | 'pro' | 'enterprise'
          logo_url: string | null
          created_at: string
          max_item_amount_clp:      number | null
          max_fund_amount_clp:      number | null
          defontana_contra_account:   string | null
          defontana_voucher_type:     string | null
          defontana_cost_center:      string | null
          defontana_provider_account: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          country: string
          currency: string
          plan?: 'free' | 'pro' | 'enterprise'
          logo_url?: string | null
          created_at?: string
          max_item_amount_clp?: number | null
          max_fund_amount_clp?: number | null
          defontana_contra_account?:   string | null
          defontana_voucher_type?:     string | null
          defontana_cost_center?:      string | null
          defontana_provider_account?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          country?: string
          currency?: string
          plan?: 'free' | 'pro' | 'enterprise'
          logo_url?: string | null
          created_at?: string
          max_item_amount_clp?: number | null
          max_fund_amount_clp?: number | null
          defontana_contra_account?:   string | null
          defontana_voucher_type?:     string | null
          defontana_cost_center?:      string | null
          defontana_provider_account?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          org_id: string
          full_name: string
          role: 'admin' | 'approver' | 'employee'
          can_submit: boolean
          can_approve: boolean
          can_manage_petty_cash: boolean
          department: string | null
          rut: string | null
          bank_account: string | null
          bank_name: string | null
          bank_account_type: string | null
          approver_l1_id: string | null
          approver_l2_id: string | null
          cost_center_id: string | null
          invited_at: string | null
          is_active: boolean
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          org_id: string
          full_name: string
          role: 'admin' | 'approver' | 'employee'
          can_submit?: boolean
          can_approve?: boolean
          can_manage_petty_cash?: boolean
          department?: string | null
          rut?: string | null
          bank_account?: string | null
          bank_name?: string | null
          bank_account_type?: string | null
          approver_l1_id?: string | null
          approver_l2_id?: string | null
          cost_center_id?: string | null
          invited_at?: string | null
          is_active?: boolean
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          full_name?: string
          role?: 'admin' | 'approver' | 'employee'
          can_submit?: boolean
          can_approve?: boolean
          can_manage_petty_cash?: boolean
          department?: string | null
          rut?: string | null
          bank_account?: string | null
          bank_name?: string | null
          bank_account_type?: string | null
          approver_l1_id?: string | null
          approver_l2_id?: string | null
          cost_center_id?: string | null
          invited_at?: string | null
          is_active?: boolean
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'users_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          }
        ]
      }
      approval_policies: {
        Row: {
          id: string
          org_id: string
          name: string
          levels: Json
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          levels: Json
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          levels?: Json
          is_default?: boolean
          created_at?: string
        }
        Relationships: []
      }
      employee_policies: {
        Row: { user_id: string; policy_id: string }
        Insert: { user_id: string; policy_id: string }
        Update: { user_id?: string; policy_id?: string }
        Relationships: []
      }
      expense_categories: {
        Row: {
          id: string
          org_id: string | null
          name: string
          icon: string | null
          color: string | null
          required_doc_types: string[] | null
          is_active: boolean
          defontana_account_code: string | null
        }
        Insert: {
          id?: string
          org_id?: string | null
          name: string
          icon?: string | null
          color?: string | null
          required_doc_types?: string[] | null
          is_active?: boolean
          defontana_account_code?: string | null
        }
        Update: {
          id?: string
          org_id?: string | null
          name?: string
          icon?: string | null
          color?: string | null
          required_doc_types?: string[] | null
          is_active?: boolean
          defontana_account_code?: string | null
        }
        Relationships: []
      }
      expense_reports: {
        Row: {
          id: string
          org_id: string
          submitter_id: string
          title: string
          description: string | null
          status: 'draft' | 'submitted' | 'pending_l2' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
          current_level: number
          total_amount: number
          approved_amount: number
          currency: string
          submitted_at: string | null
          approved_at: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          payment_reference: string | null
          defontana_exported_at: string | null
          defontana_export_ref:  string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          submitter_id: string
          title: string
          description?: string | null
          status?: 'draft' | 'submitted' | 'pending_l2' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
          current_level?: number
          total_amount?: number
          approved_amount?: number
          currency?: string
          submitted_at?: string | null
          approved_at?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          payment_reference?: string | null
          defontana_exported_at?: string | null
          defontana_export_ref?:  string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          submitter_id?: string
          title?: string
          description?: string | null
          status?: 'draft' | 'submitted' | 'pending_l2' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
          current_level?: number
          total_amount?: number
          approved_amount?: number
          currency?: string
          submitted_at?: string | null
          approved_at?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          payment_reference?: string | null
          defontana_exported_at?: string | null
          defontana_export_ref?:  string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expense_reports_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expense_reports_submitter_id_fkey'
            columns: ['submitter_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      expense_items: {
        Row: {
          id: string
          report_id: string
          org_id: string
          description: string
          amount: number
          currency: string
          exchange_rate: number
          exchange_rate_source: 'api' | 'manual'
          amount_clp: number
          date: string
          category_id: string | null
          merchant: string | null
          doc_type: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
          doc_number: string | null
          notes: string | null
          status: 'pending' | 'approved' | 'rejected'
          rejection_reason: string | null
          cost_center_id: string | null
          supplier_rut:   string | null
          ocr_raw: Json | null
          ocr_confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          org_id: string
          description: string
          amount: number
          currency: string
          exchange_rate: number
          exchange_rate_source: 'api' | 'manual'
          amount_clp: number
          date: string
          category_id?: string | null
          merchant?: string | null
          doc_type?: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
          doc_number?: string | null
          notes?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          rejection_reason?: string | null
          cost_center_id?: string | null
          supplier_rut?:   string | null
          ocr_raw?: Json | null
          ocr_confidence?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          org_id?: string
          description?: string
          amount?: number
          currency?: string
          exchange_rate?: number
          exchange_rate_source?: 'api' | 'manual'
          amount_clp?: number
          date?: string
          category_id?: string | null
          merchant?: string | null
          doc_type?: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
          doc_number?: string | null
          notes?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          rejection_reason?: string | null
          cost_center_id?: string | null
          supplier_rut?:   string | null
          ocr_raw?: Json | null
          ocr_confidence?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expense_items_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'expense_reports'
            referencedColumns: ['id']
          }
        ]
      }
      attachments: {
        Row: {
          id: string
          item_id: string
          org_id: string
          storage_path: string
          file_type: 'image' | 'pdf'
          file_size: number | null
          thumbnail_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          org_id: string
          storage_path: string
          file_type: 'image' | 'pdf'
          file_size?: number | null
          thumbnail_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          org_id?: string
          storage_path?: string
          file_type?: 'image' | 'pdf'
          file_size?: number | null
          thumbnail_path?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attachments_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'expense_items'
            referencedColumns: ['id']
          }
        ]
      }
      expense_report_approvals: {
        Row: {
          id: string
          report_id: string
          approver_id: string
          level: number
          action: 'approved' | 'rejected' | 'partially_approved' | 'returned_to_draft'
          items_approved: string[] | null
          items_rejected: string[] | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          approver_id: string
          level: number
          action: 'approved' | 'rejected' | 'partially_approved' | 'returned_to_draft'
          items_approved?: string[] | null
          items_rejected?: string[] | null
          notes?: string | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'expense_report_approvals_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'expense_reports'
            referencedColumns: ['id']
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          org_id: string
          user_id: string
          type: 'submission' | 'approval' | 'rejection' | 'reimbursement'
          report_id: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          type: 'submission' | 'approval' | 'rejection' | 'reimbursement'
          report_id?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          read?: boolean
        }
        Relationships: []
      }
      petty_cash_funds: {
        Row: {
          id: string
          org_id: string
          name: string
          employee_id: string
          manager_id: string
          amount_requested: number
          amount_approved: number | null
          currency: string
          period_start: string
          period_end: string
          description: string | null
          status: 'draft' | 'pending_approval' | 'approved' | 'funds_sent' | 'submitted' | 'pending_liquidation_approval' | 'settled' | 'rejected'
          settled_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          employee_id: string
          manager_id: string
          amount_requested: number
          amount_approved?: number | null
          currency?: string
          period_start: string
          period_end: string
          description?: string | null
          status?: 'draft' | 'pending_approval' | 'approved' | 'funds_sent' | 'submitted' | 'pending_liquidation_approval' | 'settled' | 'rejected'
          settled_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          amount_approved?: number | null
          status?: 'draft' | 'pending_approval' | 'approved' | 'funds_sent' | 'submitted' | 'pending_liquidation_approval' | 'settled' | 'rejected'
          settled_at?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      petty_cash_items: {
        Row: {
          id: string
          fund_id: string
          org_id: string
          description: string
          amount: number
          currency: string
          exchange_rate: number
          amount_clp: number
          date: string
          category_id: string | null
          merchant: string | null
          doc_type: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
          doc_number: string | null
          supplier_rut: string | null
          notes: string | null
          status: 'pending' | 'approved' | 'rejected'
          rejection_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fund_id: string
          org_id: string
          description: string
          amount: number
          currency?: string
          exchange_rate?: number
          amount_clp: number
          date: string
          category_id?: string | null
          merchant?: string | null
          doc_type?: 'boleta' | 'factura' | 'factura_exenta' | 'ticket' | 'otro' | null
          doc_number?: string | null
          supplier_rut?: string | null
          notes?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          rejection_reason?: string | null
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'approved' | 'rejected'
          rejection_reason?: string | null
        }
        Relationships: []
      }
      petty_cash_approvals: {
        Row: {
          id: string
          fund_id: string
          actor_id: string
          action: 'created' | 'submitted_for_approval' | 'approved' | 'rejected' | 'funds_sent' | 'liquidation_submitted' | 'liquidation_elevated' | 'liquidation_approved' | 'settled'
          notes: string | null
          amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          fund_id: string
          actor_id: string
          action: 'created' | 'submitted_for_approval' | 'approved' | 'rejected' | 'funds_sent' | 'liquidation_submitted' | 'liquidation_elevated' | 'liquidation_approved' | 'settled'
          notes?: string | null
          amount?: number | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      petty_cash_transfers: {
        Row: {
          id: string
          fund_id: string
          type: 'disbursement' | 'refund_to_employee' | 'reimbursement_from_employee'
          amount: number
          reference: string | null
          transferred_at: string
          registered_by: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fund_id: string
          type: 'disbursement' | 'refund_to_employee' | 'reimbursement_from_employee'
          amount: number
          reference?: string | null
          transferred_at: string
          registered_by: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          notes?: string | null
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          id: string
          org_id: string
          user_id: string
          content: string
          category: 'mejora' | 'error' | 'consulta' | 'otro'
          status: 'pending' | 'reviewing' | 'done' | 'dismissed'
          admin_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          content: string
          category?: 'mejora' | 'error' | 'consulta' | 'otro'
          status?: 'pending' | 'reviewing' | 'done' | 'dismissed'
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: 'pending' | 'reviewing' | 'done' | 'dismissed'
          admin_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          id:          string
          descripcion: string
          imputable:   boolean
          activo:      boolean
          created_at:  string
        }
        Insert: {
          id:           string
          descripcion:  string
          imputable?:   boolean
          activo?:      boolean
          created_at?:  string
        }
        Update: {
          descripcion?: string
          imputable?:   boolean
          activo?:      boolean
        }
        Relationships: []
      }
      defontana_suppliers: {
        Row: {
          id:                     string
          org_id:                 string
          merchant_name:          string
          defontana_account_code: string
          created_at:             string
        }
        Insert: {
          id?:                    string
          org_id:                 string
          merchant_name:          string
          defontana_account_code: string
          created_at?:            string
        }
        Update: {
          merchant_name?:          string
          defontana_account_code?: string
        }
        Relationships: [
          {
            foreignKeyName: 'defontana_suppliers_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          }
        ]
      }
      approval_attachments: {
        Row: {
          id: string
          org_id: string
          report_id: string | null
          fund_id: string | null
          uploaded_by: string
          storage_path: string
          filename: string
          file_size: number | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          report_id?: string | null
          fund_id?: string | null
          uploaded_by: string
          storage_path: string
          filename: string
          file_size?: number | null
          description?: string | null
          created_at?: string
        }
        Update: {
          description?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Tipos de conveniencia
export type Organization = Database['public']['Tables']['organizations']['Row']
export type UserProfile = Database['public']['Tables']['users']['Row']
export type ApprovalPolicy = Database['public']['Tables']['approval_policies']['Row']
export type ExpenseReport = Database['public']['Tables']['expense_reports']['Row']
export type ExpenseItem = Database['public']['Tables']['expense_items']['Row']
export type Attachment = Database['public']['Tables']['attachments']['Row']
export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
export type ExpenseReportApproval = Database['public']['Tables']['expense_report_approvals']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']

export type PettyCashFund     = Database['public']['Tables']['petty_cash_funds']['Row']
export type PettyCashItem     = Database['public']['Tables']['petty_cash_items']['Row']
export type PettyCashApproval = Database['public']['Tables']['petty_cash_approvals']['Row']
export type PettyCashTransfer = Database['public']['Tables']['petty_cash_transfers']['Row']

export type FundStatus = PettyCashFund['status']
export type FundAuditAction = PettyCashApproval['action']

export type Suggestion = Database['public']['Tables']['suggestions']['Row']
export type SuggestionStatus = Suggestion['status']
export type SuggestionCategory = Suggestion['category']
export type ApprovalAttachment = Database['public']['Tables']['approval_attachments']['Row']

export type CostCenter         = Database['public']['Tables']['cost_centers']['Row']
export type DefontanaSupplier  = Database['public']['Tables']['defontana_suppliers']['Row']
