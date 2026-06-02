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
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      users: {
        Row: {
          id: string
          org_id: string
          full_name: string
          role: 'admin' | 'approver' | 'employee'
          can_submit: boolean
          can_approve: boolean
          department: string | null
          bank_account: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'> & { created_at?: string }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['approval_policies']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['approval_policies']['Insert']>
      }
      employee_policies: {
        Row: { user_id: string; policy_id: string }
        Insert: Database['public']['Tables']['employee_policies']['Row']
        Update: Partial<Database['public']['Tables']['employee_policies']['Insert']>
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
        }
        Insert: Omit<Database['public']['Tables']['expense_categories']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['expense_categories']['Insert']>
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
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['expense_reports']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['expense_reports']['Insert']>
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
          ocr_raw: Json | null
          ocr_confidence: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['expense_items']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['expense_items']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['attachments']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['attachments']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['expense_report_approvals']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
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
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<Database['public']['Tables']['notifications']['Row'], 'read'>>
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
