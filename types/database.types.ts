export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          academic_year_name: string
          created_at: string
          end_date: string
          id: string
          institution_id: string
          is_active: boolean
          start_date: string
          updated_at: string
        }
        Insert: {
          academic_year_name: string
          created_at?: string
          end_date: string
          id?: string
          institution_id: string
          is_active?: boolean
          start_date: string
          updated_at?: string
        }
        Update: {
          academic_year_name?: string
          created_at?: string
          end_date?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_years_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      ai_query_logs: {
        Row: {
          created_at: string | null
          error_code: string | null
          id: string
          institution_id: string | null
          ip_address: unknown
          query_text: string
          query_type: string
          response_time_ms: number | null
          success: boolean | null
          tools_called: string[] | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          id?: string
          institution_id?: string | null
          ip_address?: unknown
          query_text: string
          query_type?: string
          response_time_ms?: number | null
          success?: boolean | null
          tools_called?: string[] | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          id?: string
          institution_id?: string | null
          ip_address?: unknown
          query_text?: string
          query_type?: string
          response_time_ms?: number | null
          success?: boolean | null
          tools_called?: string[] | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_query_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_query_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "ai_query_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_query_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_query_rate_limits: {
        Row: {
          bulk_action_count: number | null
          created_at: string | null
          id: string
          last_query_at: string | null
          query_count: number | null
          updated_at: string | null
          user_id: string
          window_start: string
        }
        Insert: {
          bulk_action_count?: number | null
          created_at?: string | null
          id?: string
          last_query_at?: string | null
          query_count?: number | null
          updated_at?: string | null
          user_id: string
          window_start?: string
        }
        Update: {
          bulk_action_count?: number | null
          created_at?: string | null
          id?: string
          last_query_at?: string | null
          query_count?: number | null
          updated_at?: string | null
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_query_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_query_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_value: string
          last_used_at: string | null
          name: string
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_value: string
          last_used_at?: string | null
          name: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_value?: string
          last_used_at?: string | null
          name?: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      applications: {
        Row: {
          allowed_redirect_uris: string[] | null
          allowed_scopes: string[] | null
          api_endpoints: Json | null
          api_key_hash: string | null
          app_id: string | null
          app_permissions: Json | null
          application_type: string
          auth_config: Json | null
          auth_enabled_at: string | null
          auth_enabled_by: string | null
          auth_method: string
          category_id: string
          created_at: string | null
          created_by: string | null
          data_sensitivity: string
          description: string | null
          display_order: number
          icon_path: string | null
          id: string
          integration_type: string
          is_active: boolean
          last_auth_activity: string | null
          lti_tool_id: string | null
          name: string
          rate_limit_requests: number | null
          rate_limit_window_minutes: number | null
          roles_access: string[]
          screenshots: string[] | null
          subcategory_id: string | null
          support_contact: Json | null
          supported_platforms: string
          tags: string[] | null
          updated_at: string | null
          url: string
          uses_parent_auth: boolean | null
        }
        Insert: {
          allowed_redirect_uris?: string[] | null
          allowed_scopes?: string[] | null
          api_endpoints?: Json | null
          api_key_hash?: string | null
          app_id?: string | null
          app_permissions?: Json | null
          application_type: string
          auth_config?: Json | null
          auth_enabled_at?: string | null
          auth_enabled_by?: string | null
          auth_method: string
          category_id: string
          created_at?: string | null
          created_by?: string | null
          data_sensitivity: string
          description?: string | null
          display_order?: number
          icon_path?: string | null
          id?: string
          integration_type: string
          is_active?: boolean
          last_auth_activity?: string | null
          lti_tool_id?: string | null
          name: string
          rate_limit_requests?: number | null
          rate_limit_window_minutes?: number | null
          roles_access?: string[]
          screenshots?: string[] | null
          subcategory_id?: string | null
          support_contact?: Json | null
          supported_platforms: string
          tags?: string[] | null
          updated_at?: string | null
          url: string
          uses_parent_auth?: boolean | null
        }
        Update: {
          allowed_redirect_uris?: string[] | null
          allowed_scopes?: string[] | null
          api_endpoints?: Json | null
          api_key_hash?: string | null
          app_id?: string | null
          app_permissions?: Json | null
          application_type?: string
          auth_config?: Json | null
          auth_enabled_at?: string | null
          auth_enabled_by?: string | null
          auth_method?: string
          category_id?: string
          created_at?: string | null
          created_by?: string | null
          data_sensitivity?: string
          description?: string | null
          display_order?: number
          icon_path?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          last_auth_activity?: string | null
          lti_tool_id?: string | null
          name?: string
          rate_limit_requests?: number | null
          rate_limit_window_minutes?: number | null
          roles_access?: string[]
          screenshots?: string[] | null
          subcategory_id?: string | null
          support_contact?: Json | null
          supported_platforms?: string
          tags?: string[] | null
          updated_at?: string | null
          url?: string
          uses_parent_auth?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_lti_tool_id_fkey"
            columns: ["lti_tool_id"]
            isOneToOne: false
            referencedRelation: "lti_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_consolidation_reports: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          error_message: string | null
          file_size: number | null
          file_url: string | null
          format: Database["public"]["Enums"]["report_format"] | null
          generated_by: string
          id: string
          institution_id: string
          is_deleted: boolean | null
          report_data: Json | null
          report_description: string | null
          report_name: string
          report_params: Json
          retry_count: number | null
          status: Database["public"]["Enums"]["report_status"] | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          file_size?: number | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["report_format"] | null
          generated_by: string
          id?: string
          institution_id: string
          is_deleted?: boolean | null
          report_data?: Json | null
          report_description?: string | null
          report_name: string
          report_params?: Json
          retry_count?: number | null
          status?: Database["public"]["Enums"]["report_status"] | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          file_size?: number | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["report_format"] | null
          generated_by?: string
          id?: string
          institution_id?: string
          is_deleted?: boolean | null
          report_data?: Json | null
          report_description?: string | null
          report_name?: string
          report_params?: Json
          retry_count?: number | null
          status?: Database["public"]["Enums"]["report_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_consolidation_reports_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "attendance_consolidation_reports_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consolidation_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "attendance_consolidation_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consolidation_reports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consolidation_reports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_code: string
          batch_name: string
          batch_year: string
          created_at: string
          end_date: string
          id: string
          institution_id: string
          is_active: boolean
          start_date: string
          updated_at: string
        }
        Insert: {
          batch_code: string
          batch_name: string
          batch_year: string
          created_at?: string
          end_date: string
          id?: string
          institution_id: string
          is_active?: boolean
          start_date: string
          updated_at?: string
        }
        Update: {
          batch_code?: string
          batch_name?: string
          batch_year?: string
          created_at?: string
          end_date?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      billing_discounts: {
        Row: {
          approval_date: string | null
          approval_status: string | null
          authorizer_id: string | null
          bill_id: string
          created_at: string | null
          created_by: string | null
          discount_amount: number
          discount_category: string
          discount_reason: string
          discount_type: string
          discount_value: number
          effective_date: string
          expiry_date: string | null
          id: string
          supporting_documents: Json | null
          updated_at: string | null
        }
        Insert: {
          approval_date?: string | null
          approval_status?: string | null
          authorizer_id?: string | null
          bill_id: string
          created_at?: string | null
          created_by?: string | null
          discount_amount: number
          discount_category: string
          discount_reason: string
          discount_type: string
          discount_value: number
          effective_date: string
          expiry_date?: string | null
          id?: string
          supporting_documents?: Json | null
          updated_at?: string | null
        }
        Update: {
          approval_date?: string | null
          approval_status?: string | null
          authorizer_id?: string | null
          bill_id?: string
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number
          discount_category?: string
          discount_reason?: string
          discount_type?: string
          discount_value?: number
          effective_date?: string
          expiry_date?: string | null
          id?: string
          supporting_documents?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_discounts_authorizer"
            columns: ["authorizer_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_billing_discounts_authorizer"
            columns: ["authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_discounts_bill"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_deletion_dependencies"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "fk_billing_discounts_bill"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_student_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoice_items: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          receipt_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          receipt_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_invoice_items_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_invoice_items_receipt"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "billing_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          additional_charges: number | null
          billing_period_from: string | null
          billing_period_to: string | null
          created_at: string | null
          created_by: string | null
          discount_applied: number | null
          due_date: string | null
          grand_total: number
          id: string
          institution_id: string
          invoice_date: string
          invoice_description: string | null
          invoice_number: string
          invoice_type: string
          payment_terms: string | null
          student_id: string
          tax_summary: Json | null
          updated_at: string | null
        }
        Insert: {
          additional_charges?: number | null
          billing_period_from?: string | null
          billing_period_to?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_applied?: number | null
          due_date?: string | null
          grand_total: number
          id?: string
          institution_id: string
          invoice_date: string
          invoice_description?: string | null
          invoice_number: string
          invoice_type: string
          payment_terms?: string | null
          student_id: string
          tax_summary?: Json | null
          updated_at?: string | null
        }
        Update: {
          additional_charges?: number | null
          billing_period_from?: string | null
          billing_period_to?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_applied?: number | null
          due_date?: string | null
          grand_total?: number
          id?: string
          institution_id?: string
          invoice_date?: string
          invoice_description?: string | null
          invoice_number?: string
          invoice_type?: string
          payment_terms?: string | null
          student_id?: string
          tax_summary?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_invoices_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_invoices_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "fk_billing_invoices_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_invoices_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
        ]
      }
      billing_item_categories: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          frequency: string
          id: string
          institution_id: string
          is_active: boolean
          item_category_name: string
          parent_category_id: string
          sub_category_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          frequency: string
          id?: string
          institution_id: string
          is_active?: boolean
          item_category_name: string
          parent_category_id: string
          sub_category_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          frequency?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          item_category_name?: string
          parent_category_id?: string
          sub_category_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_item_categories_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_item_categories_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "fk_billing_item_categories_parent_category"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "billing_parent_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_item_categories_sub_category"
            columns: ["sub_category_id"]
            isOneToOne: false
            referencedRelation: "billing_sub_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_parent_categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          institution_id: string
          is_active: boolean
          parent_category_name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          parent_category_name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          parent_category_name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_parent_categories_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_parent_categories_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      billing_receipt_items: {
        Row: {
          amount_paid: number
          bill_id: string
          created_at: string | null
          id: string
          receipt_id: string
        }
        Insert: {
          amount_paid: number
          bill_id: string
          created_at?: string | null
          id?: string
          receipt_id: string
        }
        Update: {
          amount_paid?: number
          bill_id?: string
          created_at?: string | null
          id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_receipt_items_bill"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_deletion_dependencies"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "fk_billing_receipt_items_bill"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_student_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_receipt_items_receipt"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "billing_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_receipts: {
        Row: {
          accountant_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          institution_id: string
          payer_contact: string | null
          payer_name: string
          payment_amount: number
          payment_mode: string
          payment_paid_date: string
          payment_reference_number: string | null
          payment_remarks: string | null
          receipt_date: string
          receipt_number: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          accountant_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id: string
          payer_contact?: string | null
          payer_name: string
          payment_amount: number
          payment_mode: string
          payment_paid_date: string
          payment_reference_number?: string | null
          payment_remarks?: string | null
          receipt_date: string
          receipt_number: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          accountant_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id?: string
          payer_contact?: string | null
          payer_name?: string
          payment_amount?: number
          payment_mode?: string
          payment_paid_date?: string
          payment_reference_number?: string | null
          payment_remarks?: string | null
          receipt_date?: string
          receipt_number?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_receipts_accountant"
            columns: ["accountant_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_billing_receipts_accountant"
            columns: ["accountant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_receipts_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_receipts_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "fk_billing_receipts_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_receipts_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
        ]
      }
      billing_refunds: {
        Row: {
          approval_status: string | null
          approved_by: string | null
          authorizer_id: string | null
          bank_details: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          net_refund_amount: number
          processing_fee: number | null
          receipt_id: string
          refund_amount: number
          refund_category: string
          refund_date: string
          refund_method: string
          refund_reason: string
          supporting_documents: Json | null
          updated_at: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_by?: string | null
          authorizer_id?: string | null
          bank_details?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          net_refund_amount: number
          processing_fee?: number | null
          receipt_id: string
          refund_amount: number
          refund_category: string
          refund_date: string
          refund_method: string
          refund_reason: string
          supporting_documents?: Json | null
          updated_at?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_by?: string | null
          authorizer_id?: string | null
          bank_details?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          net_refund_amount?: number
          processing_fee?: number | null
          receipt_id?: string
          refund_amount?: number
          refund_category?: string
          refund_date?: string
          refund_method?: string
          refund_reason?: string
          supporting_documents?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_refunds_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_billing_refunds_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_refunds_authorizer"
            columns: ["authorizer_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_billing_refunds_authorizer"
            columns: ["authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_refunds_receipt"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "billing_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_student_bills: {
        Row: {
          balance_amount: number | null
          bill_description: string | null
          created_at: string | null
          created_by: string | null
          due_date: string
          final_amount: number
          id: string
          institution_id: string
          is_recurring: boolean | null
          item_category_id: string
          number_of_recurrences: number | null
          payment_date: string | null
          quantity: number | null
          recurrence_pattern: string | null
          remarks: string | null
          status: string | null
          student_id: string
          tax_amount: number | null
          total_amount: number
          unit_amount: number
          updated_at: string | null
        }
        Insert: {
          balance_amount?: number | null
          bill_description?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date: string
          final_amount: number
          id?: string
          institution_id: string
          is_recurring?: boolean | null
          item_category_id: string
          number_of_recurrences?: number | null
          payment_date?: string | null
          quantity?: number | null
          recurrence_pattern?: string | null
          remarks?: string | null
          status?: string | null
          student_id: string
          tax_amount?: number | null
          total_amount: number
          unit_amount: number
          updated_at?: string | null
        }
        Update: {
          balance_amount?: number | null
          bill_description?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string
          final_amount?: number
          id?: string
          institution_id?: string
          is_recurring?: boolean | null
          item_category_id?: string
          number_of_recurrences?: number | null
          payment_date?: string | null
          quantity?: number | null
          recurrence_pattern?: string | null
          remarks?: string | null
          status?: string | null
          student_id?: string
          tax_amount?: number | null
          total_amount?: number
          unit_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_student_bills_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_student_bills_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "fk_billing_student_bills_item_category"
            columns: ["item_category_id"]
            isOneToOne: false
            referencedRelation: "billing_item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_student_bills_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_student_bills_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
        ]
      }
      billing_sub_categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          institution_id: string
          is_active: boolean
          parent_category_id: string
          sub_category_name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          parent_category_id: string
          sub_category_name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          parent_category_id?: string
          sub_category_name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_sub_categories_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_sub_categories_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "fk_billing_sub_categories_parent_category"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "billing_parent_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_report_message_reads: {
        Row: {
          created_at: string
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_reads_message"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "bug_report_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_message_reads_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_message_reads_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_report_messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          bug_report_id: string
          created_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean | null
          is_internal: boolean | null
          message_text: string
          message_type: string | null
          reply_to_message_id: string | null
          sender_user_id: string
          updated_at: string | null
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          bug_report_id: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_internal?: boolean | null
          message_text: string
          message_type?: string | null
          reply_to_message_id?: string | null
          sender_user_id: string
          updated_at?: string | null
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          bug_report_id?: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_internal?: boolean | null
          message_text?: string
          message_type?: string | null
          reply_to_message_id?: string | null
          sender_user_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_report_messages_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_report_messages_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports_with_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_report_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "bug_report_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_report_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bug_report_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_report_participants: {
        Row: {
          bug_report_id: string
          can_view_internal: boolean | null
          id: string
          is_active: boolean | null
          joined_at: string | null
          last_read_at: string | null
          last_read_message_id: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          bug_report_id: string
          can_view_internal?: boolean | null
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          last_read_message_id?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          bug_report_id?: string
          can_view_internal?: boolean | null
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          last_read_message_id?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_report_participants_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_report_participants_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports_with_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_report_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bug_report_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_participants_last_read_message"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "bug_report_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          application_id: string | null
          assigned_to_user_id: string | null
          category: string | null
          console_logs: Json | null
          created_at: string
          department_id: string | null
          description: string
          display_id: string | null
          id: string
          institution_id: string | null
          metadata: Json | null
          page_url: string
          priority: string | null
          reporter_ip: unknown
          reporter_user_agent: string | null
          reporter_user_id: string | null
          resolved_at: string | null
          screenshot_url: string | null
          status: string
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          application_id?: string | null
          assigned_to_user_id?: string | null
          category?: string | null
          console_logs?: Json | null
          created_at?: string
          department_id?: string | null
          description: string
          display_id?: string | null
          id?: string
          institution_id?: string | null
          metadata?: Json | null
          page_url: string
          priority?: string | null
          reporter_ip?: unknown
          reporter_user_agent?: string | null
          reporter_user_id?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          application_id?: string | null
          assigned_to_user_id?: string | null
          category?: string | null
          console_logs?: Json | null
          created_at?: string
          department_id?: string | null
          description?: string
          display_id?: string | null
          id?: string
          institution_id?: string | null
          metadata?: Json | null
          page_url?: string
          priority?: string | null
          reporter_ip?: unknown
          reporter_user_agent?: string | null
          reporter_user_id?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      course_mappings: {
        Row: {
          course_id: string
          created_at: string
          degree_id: string
          department_id: string
          id: string
          institution_id: string
          is_active: boolean | null
          program_id: string
          semester_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          degree_id: string
          department_id: string
          id?: string
          institution_id: string
          is_active?: boolean | null
          program_id: string
          semester_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          degree_id?: string
          department_id?: string
          id?: string
          institution_id?: string
          is_active?: boolean | null
          program_id?: string
          semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_mappings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_mappings_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_mappings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_mappings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_mappings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "course_mappings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_mappings_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          course_code: string
          course_name: string
          created_at: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          course_code: string
          course_name: string
          created_at?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          course_code?: string
          course_name?: string
          created_at?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_system_role: boolean | null
          permissions: Json | null
          role_key: string
          role_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          permissions?: Json | null
          role_key: string
          role_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          permissions?: Json | null
          role_key?: string
          role_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_engagement_metrics: {
        Row: {
          avg_modules_per_user: number | null
          avg_session_duration_minutes: number | null
          created_at: string
          department_id: string | null
          id: string
          institution_id: string
          metric_date: string
          program_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          section_id: string | null
          semester_id: string | null
          total_active_time_hours: number | null
          total_logins: number
          total_sessions: number
          unique_users: number
          updated_at: string
        }
        Insert: {
          avg_modules_per_user?: number | null
          avg_session_duration_minutes?: number | null
          created_at?: string
          department_id?: string | null
          id?: string
          institution_id: string
          metric_date: string
          program_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          section_id?: string | null
          semester_id?: string | null
          total_active_time_hours?: number | null
          total_logins?: number
          total_sessions?: number
          unique_users?: number
          updated_at?: string
        }
        Update: {
          avg_modules_per_user?: number | null
          avg_session_duration_minutes?: number | null
          created_at?: string
          department_id?: string | null
          id?: string
          institution_id?: string
          metric_date?: string
          program_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          section_id?: string | null
          semester_id?: string | null
          total_active_time_hours?: number | null
          total_logins?: number
          total_sessions?: number
          unique_users?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_engagement_metrics_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_engagement_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_engagement_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "daily_engagement_metrics_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_engagement_metrics_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_engagement_metrics_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_configurations: {
        Row: {
          configuration_name: string
          created_at: string | null
          id: string
          is_default: boolean | null
          layout_config: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          configuration_name?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          layout_config?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          configuration_name?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          layout_config?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dashboard_widget_types: {
        Row: {
          category: string
          created_at: string | null
          data_source: string
          default_config: Json | null
          description: string | null
          id: string
          is_active: boolean | null
          permissions_required: string[] | null
          updated_at: string | null
          widget_key: string
          widget_name: string
        }
        Insert: {
          category: string
          created_at?: string | null
          data_source: string
          default_config?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          permissions_required?: string[] | null
          updated_at?: string | null
          widget_key: string
          widget_name: string
        }
        Update: {
          category?: string
          created_at?: string | null
          data_source?: string
          default_config?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          permissions_required?: string[] | null
          updated_at?: string | null
          widget_key?: string
          widget_name?: string
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          configuration_id: string
          created_at: string | null
          height: number
          id: string
          is_visible: boolean | null
          position_x: number
          position_y: number
          sort_order: number | null
          updated_at: string | null
          widget_config: Json | null
          widget_type_id: string
          width: number
        }
        Insert: {
          configuration_id: string
          created_at?: string | null
          height?: number
          id?: string
          is_visible?: boolean | null
          position_x?: number
          position_y?: number
          sort_order?: number | null
          updated_at?: string | null
          widget_config?: Json | null
          widget_type_id: string
          width?: number
        }
        Update: {
          configuration_id?: string
          created_at?: string | null
          height?: number
          id?: string
          is_visible?: boolean | null
          position_x?: number
          position_y?: number
          sort_order?: number | null
          updated_at?: string | null
          widget_config?: Json | null
          widget_type_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "dashboard_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_widgets_widget_type_id_fkey"
            columns: ["widget_type_id"]
            isOneToOne: false
            referencedRelation: "dashboard_widget_types"
            referencedColumns: ["id"]
          },
        ]
      }
      degrees: {
        Row: {
          created_at: string | null
          created_by: string | null
          degree_id: string
          degree_name: string
          degree_order: number
          degree_type: string
          display_name: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          degree_id: string
          degree_name: string
          degree_order?: number
          degree_type: string
          display_name?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          degree_id?: string
          degree_name?: string
          degree_order?: number
          degree_type?: string
          display_name?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "degrees_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "degrees_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          degree_id: string
          department_code: string
          department_name: string
          department_order: number
          display_name: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          degree_id: string
          department_code: string
          department_name: string
          department_order?: number
          display_name?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          degree_id?: string
          department_code?: string
          department_name?: string
          department_order?: number
          display_name?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      employment_categories: {
        Row: {
          category_name: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_name: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      institution_leaves: {
        Row: {
          academic_year_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          department_ids: string[] | null
          description: string | null
          end_date: string
          id: string
          institution_id: string
          is_recurring: boolean
          leave_name: string
          leave_type_id: string
          recurrence_pattern: Json | null
          rejection_reason: string | null
          requested_by: string
          scope_level: string
          section_ids: string[] | null
          semester_ids: string[] | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department_ids?: string[] | null
          description?: string | null
          end_date: string
          id?: string
          institution_id: string
          is_recurring?: boolean
          leave_name: string
          leave_type_id: string
          recurrence_pattern?: Json | null
          rejection_reason?: string | null
          requested_by: string
          scope_level?: string
          section_ids?: string[] | null
          semester_ids?: string[] | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department_ids?: string[] | null
          description?: string | null
          end_date?: string
          id?: string
          institution_id?: string
          is_recurring?: boolean
          leave_name?: string
          leave_type_id?: string
          recurrence_pattern?: Json | null
          rejection_reason?: string | null
          requested_by?: string
          scope_level?: string
          section_ids?: string[] | null
          semester_ids?: string[] | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_leaves_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_leaves_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "institution_leaves_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_leaves_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_leaves_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "institution_leaves_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_leaves_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "institution_leaves_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          accounts_dept: Json | null
          accredited_by: string | null
          address_line1: string | null
          address_line2: string | null
          address_line3: string | null
          administration_dept: Json | null
          admission_dept: Json | null
          anti_ragging_dept: Json | null
          category: string | null
          city: string | null
          counselling_code: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          institution_type: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          pin_code: string | null
          placement_dept: Json | null
          state: string | null
          timetable_type: string | null
          transportation_dept: Json | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          accounts_dept?: Json | null
          accredited_by?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          administration_dept?: Json | null
          admission_dept?: Json | null
          anti_ragging_dept?: Json | null
          category?: string | null
          city?: string | null
          counselling_code?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          institution_type?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          pin_code?: string | null
          placement_dept?: Json | null
          state?: string | null
          timetable_type?: string | null
          transportation_dept?: Json | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          accounts_dept?: Json | null
          accredited_by?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          administration_dept?: Json | null
          admission_dept?: Json | null
          anti_ragging_dept?: Json | null
          category?: string | null
          city?: string | null
          counselling_code?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          institution_type?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          pin_code?: string | null
          placement_dept?: Json | null
          state?: string | null
          timetable_type?: string | null
          transportation_dept?: Json | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      learner_application_sequences_by_code: {
        Row: {
          counselling_code: string
          current_sequence: number
          updated_at: string | null
        }
        Insert: {
          counselling_code: string
          current_sequence?: number
          updated_at?: string | null
        }
        Update: {
          counselling_code?: string
          current_sequence?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      learners_profiles: {
        Row: {
          aadhar_number: string | null
          academic_year_id: string | null
          accommodation_type: string
          admission_year: number | null
          annual_income: string | null
          application_id: string | null
          batch_id: string | null
          blood_group: string | null
          board_of_study: string
          bus_pickup_location: string | null
          bus_required: boolean | null
          bus_route: string | null
          caste: string | null
          category: string | null
          college_email: string | null
          community: string
          counseling_applied: boolean | null
          counseling_number: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string
          degree_id: string | null
          department_id: string | null
          engineering_cutoff_marks: string | null
          enquiry_date: string | null
          entry_type: string
          father_mobile: string
          father_name: string
          father_occupation: string | null
          first_name: string
          food_type: string | null
          gender: string
          hostel_type: string | null
          id: string
          institution_id: string | null
          is_profile_complete: boolean | null
          last_name: string | null
          last_school: string
          lifecycle_status: Database["public"]["Enums"]["lifecycle_status"]
          medical_cutoff_marks: string | null
          migrated_at: string | null
          migration_source: string | null
          mother_mobile: string
          mother_name: string
          mother_occupation: string | null
          neet_roll_number: string | null
          neet_score: string | null
          permanent_address_district: string
          permanent_address_pin_code: string
          permanent_address_state: string
          permanent_address_street: string
          permanent_address_taluk: string | null
          program_id: string | null
          quota: string | null
          reference_contact: string | null
          reference_name: string | null
          reference_type: string | null
          register_number: string | null
          regulation_id: string | null
          religion: string
          roll_number: string | null
          scholarship_type: string | null
          section_id: string | null
          semester_id: string | null
          student_email: string
          student_mobile: string
          student_photo_url: string | null
          tenth_marks: Json
          twelfth_marks: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type: string
          admission_year?: number | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          blood_group?: string | null
          board_of_study: string
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community: string
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth: string
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          enquiry_date?: string | null
          entry_type: string
          father_mobile: string
          father_name: string
          father_occupation?: string | null
          first_name: string
          food_type?: string | null
          gender: string
          hostel_type?: string | null
          id?: string
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school: string
          lifecycle_status?: Database["public"]["Enums"]["lifecycle_status"]
          medical_cutoff_marks?: string | null
          migrated_at?: string | null
          migration_source?: string | null
          mother_mobile: string
          mother_name: string
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          permanent_address_district: string
          permanent_address_pin_code: string
          permanent_address_state: string
          permanent_address_street: string
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion: string
          roll_number?: string | null
          scholarship_type?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email: string
          student_mobile: string
          student_photo_url?: string | null
          tenth_marks: Json
          twelfth_marks: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string
          admission_year?: number | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          blood_group?: string | null
          board_of_study?: string
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          enquiry_date?: string | null
          entry_type?: string
          father_mobile?: string
          father_name?: string
          father_occupation?: string | null
          first_name?: string
          food_type?: string | null
          gender?: string
          hostel_type?: string | null
          id?: string
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string
          lifecycle_status?: Database["public"]["Enums"]["lifecycle_status"]
          medical_cutoff_marks?: string | null
          migrated_at?: string | null
          migration_source?: string | null
          mother_mobile?: string
          mother_name?: string
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          permanent_address_district?: string
          permanent_address_pin_code?: string
          permanent_address_state?: string
          permanent_address_street?: string
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string
          roll_number?: string | null
          scholarship_type?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string
          student_mobile?: string
          student_photo_url?: string | null
          tenth_marks?: Json
          twelfth_marks?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_learners_profiles_academic_year"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_batch"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_degree"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_program"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_regulation"
            columns: ["regulation_id"]
            isOneToOne: false
            referencedRelation: "regulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_section"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learners_profiles_semester"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learners_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "learners_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learners_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "learners_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learners_profiles_backup_20251223: {
        Row: {
          aadhar_number: string | null
          academic_year_id: string | null
          accommodation_type: string | null
          admission_year: number | null
          annual_income: string | null
          application_id: string | null
          batch_id: string | null
          blood_group: string | null
          board_of_study: string | null
          bus_pickup_location: string | null
          bus_required: boolean | null
          bus_route: string | null
          caste: string | null
          category: string | null
          college_email: string | null
          community: string | null
          counseling_applied: boolean | null
          counseling_number: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          degree_id: string | null
          department_id: string | null
          engineering_cutoff_marks: string | null
          enquiry_date: string | null
          entry_type: string | null
          father_mobile: string | null
          father_name: string | null
          father_occupation: string | null
          first_graduate: boolean | null
          first_name: string | null
          food_type: string | null
          gender: string | null
          hostel_type: string | null
          id: string | null
          institution_id: string | null
          is_profile_complete: boolean | null
          last_name: string | null
          last_school: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["lifecycle_status"]
            | null
          medical_cutoff_marks: string | null
          migrated_at: string | null
          migration_source: string | null
          mother_mobile: string | null
          mother_name: string | null
          mother_occupation: string | null
          neet_roll_number: string | null
          neet_score: string | null
          original_admission_id: string | null
          original_student_id: string | null
          permanent_address_district: string | null
          permanent_address_pin_code: string | null
          permanent_address_state: string | null
          permanent_address_street: string | null
          permanent_address_taluk: string | null
          program_id: string | null
          quota: string | null
          reference_contact: string | null
          reference_name: string | null
          reference_type: string | null
          register_number: string | null
          regulation_id: string | null
          religion: string | null
          roll_number: string | null
          section_id: string | null
          semester_id: string | null
          student_email: string | null
          student_mobile: string | null
          student_photo_url: string | null
          tenth_marks: Json | null
          twelfth_marks: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string | null
          admission_year?: number | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          blood_group?: string | null
          board_of_study?: string | null
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string | null
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          enquiry_date?: string | null
          entry_type?: string | null
          father_mobile?: string | null
          father_name?: string | null
          father_occupation?: string | null
          first_graduate?: boolean | null
          first_name?: string | null
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string | null
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["lifecycle_status"]
            | null
          medical_cutoff_marks?: string | null
          migrated_at?: string | null
          migration_source?: string | null
          mother_mobile?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          original_admission_id?: string | null
          original_student_id?: string | null
          permanent_address_district?: string | null
          permanent_address_pin_code?: string | null
          permanent_address_state?: string | null
          permanent_address_street?: string | null
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string | null
          roll_number?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string | null
          student_mobile?: string | null
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string | null
          admission_year?: number | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          blood_group?: string | null
          board_of_study?: string | null
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string | null
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          enquiry_date?: string | null
          entry_type?: string | null
          father_mobile?: string | null
          father_name?: string | null
          father_occupation?: string | null
          first_graduate?: boolean | null
          first_name?: string | null
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string | null
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["lifecycle_status"]
            | null
          medical_cutoff_marks?: string | null
          migrated_at?: string | null
          migration_source?: string | null
          mother_mobile?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          original_admission_id?: string | null
          original_student_id?: string | null
          permanent_address_district?: string | null
          permanent_address_pin_code?: string | null
          permanent_address_state?: string | null
          permanent_address_street?: string | null
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string | null
          roll_number?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string | null
          student_mobile?: string | null
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      learners_profiles_backup_bpharm_sem8_active: {
        Row: {
          aadhar_number: string | null
          academic_year_id: string | null
          accommodation_type: string | null
          admission_year: number | null
          annual_income: string | null
          application_id: string | null
          batch_id: string | null
          blood_group: string | null
          board_of_study: string | null
          bus_pickup_location: string | null
          bus_required: boolean | null
          bus_route: string | null
          caste: string | null
          category: string | null
          college_email: string | null
          community: string | null
          counseling_applied: boolean | null
          counseling_number: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          degree_id: string | null
          department_id: string | null
          engineering_cutoff_marks: string | null
          enquiry_date: string | null
          entry_type: string | null
          father_mobile: string | null
          father_name: string | null
          father_occupation: string | null
          first_graduate: boolean | null
          first_name: string | null
          food_type: string | null
          gender: string | null
          hostel_type: string | null
          id: string | null
          institution_id: string | null
          is_profile_complete: boolean | null
          last_name: string | null
          last_school: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["lifecycle_status"]
            | null
          medical_cutoff_marks: string | null
          migrated_at: string | null
          migration_source: string | null
          mother_mobile: string | null
          mother_name: string | null
          mother_occupation: string | null
          neet_roll_number: string | null
          neet_score: string | null
          permanent_address_district: string | null
          permanent_address_pin_code: string | null
          permanent_address_state: string | null
          permanent_address_street: string | null
          permanent_address_taluk: string | null
          program_id: string | null
          quota: string | null
          reference_contact: string | null
          reference_name: string | null
          reference_type: string | null
          register_number: string | null
          regulation_id: string | null
          religion: string | null
          roll_number: string | null
          section_id: string | null
          semester_id: string | null
          student_email: string | null
          student_mobile: string | null
          student_photo_url: string | null
          tenth_marks: Json | null
          twelfth_marks: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string | null
          admission_year?: number | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          blood_group?: string | null
          board_of_study?: string | null
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string | null
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          enquiry_date?: string | null
          entry_type?: string | null
          father_mobile?: string | null
          father_name?: string | null
          father_occupation?: string | null
          first_graduate?: boolean | null
          first_name?: string | null
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string | null
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["lifecycle_status"]
            | null
          medical_cutoff_marks?: string | null
          migrated_at?: string | null
          migration_source?: string | null
          mother_mobile?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          permanent_address_district?: string | null
          permanent_address_pin_code?: string | null
          permanent_address_state?: string | null
          permanent_address_street?: string | null
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string | null
          roll_number?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string | null
          student_mobile?: string | null
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string | null
          admission_year?: number | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          blood_group?: string | null
          board_of_study?: string | null
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string | null
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          enquiry_date?: string | null
          entry_type?: string | null
          father_mobile?: string | null
          father_name?: string | null
          father_occupation?: string | null
          first_graduate?: boolean | null
          first_name?: string | null
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string | null
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["lifecycle_status"]
            | null
          medical_cutoff_marks?: string | null
          migrated_at?: string | null
          migration_source?: string | null
          mother_mobile?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          permanent_address_district?: string | null
          permanent_address_pin_code?: string | null
          permanent_address_state?: string | null
          permanent_address_street?: string | null
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string | null
          roll_number?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string | null
          student_mobile?: string | null
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      leave_approval_chains: {
        Row: {
          approver_role: string
          approver_scope: string | null
          can_skip_if_approved_by_higher: boolean
          chain_order: number
          created_at: string
          id: string
          institution_id: string
          is_active: boolean
          is_required: boolean
          leave_type_id: string | null
          scope_level: string
          updated_at: string
        }
        Insert: {
          approver_role: string
          approver_scope?: string | null
          can_skip_if_approved_by_higher?: boolean
          chain_order?: number
          created_at?: string
          id?: string
          institution_id: string
          is_active?: boolean
          is_required?: boolean
          leave_type_id?: string | null
          scope_level?: string
          updated_at?: string
        }
        Update: {
          approver_role?: string
          approver_scope?: string | null
          can_skip_if_approved_by_higher?: boolean
          chain_order?: number
          created_at?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          is_required?: boolean
          leave_type_id?: string | null
          scope_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_approval_chains_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_approvals: {
        Row: {
          acted_at: string | null
          action: string
          approval_chain_id: string | null
          approver_id: string
          comments: string | null
          created_at: string
          id: string
          leave_id: string
          updated_at: string
        }
        Insert: {
          acted_at?: string | null
          action: string
          approval_chain_id?: string | null
          approver_id: string
          comments?: string | null
          created_at?: string
          id?: string
          leave_id: string
          updated_at?: string
        }
        Update: {
          acted_at?: string | null
          action?: string
          approval_chain_id?: string | null
          approver_id?: string
          comments?: string | null
          created_at?: string
          id?: string
          leave_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_approvals_approval_chain_id_fkey"
            columns: ["approval_chain_id"]
            isOneToOne: false
            referencedRelation: "leave_approval_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_approvals_leave_id_fkey"
            columns: ["leave_id"]
            isOneToOne: false
            referencedRelation: "institution_leaves"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          color_code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          institution_id: string
          is_active: boolean
          leave_type_code: string
          leave_type_name: string
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          color_code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          leave_type_code: string
          leave_type_name: string
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          color_code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          leave_type_code?: string
          leave_type_name?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      lti_grades: {
        Row: {
          activity_progress: string | null
          created_at: string | null
          gradebook_entry_id: string | null
          graded_at: string | null
          grading_progress: string | null
          id: string
          idempotency_key: string | null
          institution_id: string
          launch_id: string | null
          learner_profile_id: string
          received_at: string | null
          resource_link_id: string
          resource_link_title: string | null
          score: number
          score_maximum: number
          score_percentage: number | null
          sync_error: string | null
          synced_at: string | null
          synced_to_gradebook: boolean | null
          tool_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_progress?: string | null
          created_at?: string | null
          gradebook_entry_id?: string | null
          graded_at?: string | null
          grading_progress?: string | null
          id?: string
          idempotency_key?: string | null
          institution_id: string
          launch_id?: string | null
          learner_profile_id: string
          received_at?: string | null
          resource_link_id: string
          resource_link_title?: string | null
          score: number
          score_maximum: number
          score_percentage?: number | null
          sync_error?: string | null
          synced_at?: string | null
          synced_to_gradebook?: boolean | null
          tool_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_progress?: string | null
          created_at?: string | null
          gradebook_entry_id?: string | null
          graded_at?: string | null
          grading_progress?: string | null
          id?: string
          idempotency_key?: string | null
          institution_id?: string
          launch_id?: string | null
          learner_profile_id?: string
          received_at?: string | null
          resource_link_id?: string
          resource_link_title?: string | null
          score?: number
          score_maximum?: number
          score_percentage?: number | null
          sync_error?: string | null
          synced_at?: string | null
          synced_to_gradebook?: boolean | null
          tool_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lti_grades_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_grades_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lti_grades_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "lti_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_grades_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_grades_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "lti_grades_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "lti_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      lti_launches: {
        Row: {
          academic_year_id: string | null
          context_id: string | null
          context_label: string | null
          context_title: string | null
          created_by: string | null
          id: string
          institution_id: string
          ip_address: unknown
          jwt_expires_at: string | null
          jwt_nonce: string | null
          launch_type: string | null
          launched_at: string | null
          learner_profile_id: string | null
          lti_message_type: string | null
          lti_version: string | null
          myjkkn_role: string | null
          program_id: string | null
          resource_link_description: string | null
          resource_link_id: string | null
          resource_link_title: string | null
          section_id: string | null
          semester_id: string | null
          session_duration_seconds: number | null
          tool_id: string
          user_agent: string | null
          user_id: string
          user_role_sent: string | null
        }
        Insert: {
          academic_year_id?: string | null
          context_id?: string | null
          context_label?: string | null
          context_title?: string | null
          created_by?: string | null
          id?: string
          institution_id: string
          ip_address?: unknown
          jwt_expires_at?: string | null
          jwt_nonce?: string | null
          launch_type?: string | null
          launched_at?: string | null
          learner_profile_id?: string | null
          lti_message_type?: string | null
          lti_version?: string | null
          myjkkn_role?: string | null
          program_id?: string | null
          resource_link_description?: string | null
          resource_link_id?: string | null
          resource_link_title?: string | null
          section_id?: string | null
          semester_id?: string | null
          session_duration_seconds?: number | null
          tool_id: string
          user_agent?: string | null
          user_id: string
          user_role_sent?: string | null
        }
        Update: {
          academic_year_id?: string | null
          context_id?: string | null
          context_label?: string | null
          context_title?: string | null
          created_by?: string | null
          id?: string
          institution_id?: string
          ip_address?: unknown
          jwt_expires_at?: string | null
          jwt_nonce?: string | null
          launch_type?: string | null
          launched_at?: string | null
          learner_profile_id?: string | null
          lti_message_type?: string | null
          lti_version?: string | null
          myjkkn_role?: string | null
          program_id?: string | null
          resource_link_description?: string | null
          resource_link_id?: string | null
          resource_link_title?: string | null
          section_id?: string | null
          semester_id?: string | null
          session_duration_seconds?: number | null
          tool_id?: string
          user_agent?: string | null
          user_id?: string
          user_role_sent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lti_launches_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_launches_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_launches_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lti_launches_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_launches_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "lti_launches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_launches_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_launches_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lti_launches_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "lti_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      lti_tools: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          deployment_id: string
          id: string
          is_active: boolean | null
          launch_url: string
          license_expiry_date: string | null
          name: string
          oidc_auth_url: string
          platform_id: string | null
          public_keyset_url: string
          redirect_uri: string
          supports_deep_linking: boolean | null
          supports_grade_passback: boolean | null
          supports_names_roles: boolean | null
          tool_type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          deployment_id: string
          id?: string
          is_active?: boolean | null
          launch_url: string
          license_expiry_date?: string | null
          name: string
          oidc_auth_url: string
          platform_id?: string | null
          public_keyset_url: string
          redirect_uri: string
          supports_deep_linking?: boolean | null
          supports_grade_passback?: boolean | null
          supports_names_roles?: boolean | null
          tool_type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          deployment_id?: string
          id?: string
          is_active?: boolean | null
          launch_url?: string
          license_expiry_date?: string | null
          name?: string
          oidc_auth_url?: string
          platform_id?: string | null
          public_keyset_url?: string
          redirect_uri?: string
          supports_deep_linking?: boolean | null
          supports_grade_passback?: boolean | null
          supports_names_roles?: boolean | null
          tool_type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      migration_log: {
        Row: {
          details: Json | null
          id: number
          migration_date: string | null
          migration_name: string
          status: string
        }
        Insert: {
          details?: Json | null
          id?: number
          migration_date?: string | null
          migration_name: string
          status: string
        }
        Update: {
          details?: Json | null
          id?: number
          migration_date?: string | null
          migration_name?: string
          status?: string
        }
        Relationships: []
      }
      mv_student_billing_summary: {
        Row: {
          last_bill_update: string | null
          last_payment_date: string | null
          overdue_bills: number | null
          paid_bills: number | null
          partially_paid_bills: number | null
          roll_number: string | null
          student_id: string
          student_name: string | null
          summary_generated_at: string | null
          total_bill_amount: number | null
          total_bills: number | null
          total_outstanding: number | null
          total_processed_refunds: number | null
          total_receipt_amount: number | null
          total_receipts: number | null
          total_refunds: number | null
          unpaid_bills: number | null
        }
        Insert: {
          last_bill_update?: string | null
          last_payment_date?: string | null
          overdue_bills?: number | null
          paid_bills?: number | null
          partially_paid_bills?: number | null
          roll_number?: string | null
          student_id: string
          student_name?: string | null
          summary_generated_at?: string | null
          total_bill_amount?: number | null
          total_bills?: number | null
          total_outstanding?: number | null
          total_processed_refunds?: number | null
          total_receipt_amount?: number | null
          total_receipts?: number | null
          total_refunds?: number | null
          unpaid_bills?: number | null
        }
        Update: {
          last_bill_update?: string | null
          last_payment_date?: string | null
          overdue_bills?: number | null
          paid_bills?: number | null
          partially_paid_bills?: number | null
          roll_number?: string | null
          student_id?: string
          student_name?: string | null
          summary_generated_at?: string | null
          total_bill_amount?: number | null
          total_bills?: number | null
          total_outstanding?: number | null
          total_processed_refunds?: number | null
          total_receipt_amount?: number | null
          total_receipts?: number | null
          total_refunds?: number | null
          unpaid_bills?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          icon: string | null
          id: string
          metadata: Json | null
          priority: string | null
          sent_at: string | null
          targeting: Json
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          sent_at?: string | null
          targeting: Json
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          sent_at?: string | null
          targeting?: Json
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transaction_items: {
        Row: {
          amount: number
          bill_id: string
          created_at: string | null
          id: string
          transaction_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string | null
          id?: string
          transaction_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string | null
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_transaction_items_bill"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_deletion_dependencies"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "fk_payment_transaction_items_bill"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_student_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_transaction_items_transaction"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          bill_ids: string[]
          completed_at: string | null
          created_at: string | null
          currency: string | null
          gateway_response: Json | null
          gateway_transaction_id: string | null
          id: string
          institution_id: string
          payment_date: string | null
          payment_method: string | null
          processed_at: string | null
          session_id: string
          status: string
          student_id: string
          total_amount: number
          transaction_ref: string
          updated_at: string | null
          verification_hash: string | null
          verification_response: Json | null
          verified_amount: number | null
        }
        Insert: {
          bill_ids: string[]
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          gateway_response?: Json | null
          gateway_transaction_id?: string | null
          id?: string
          institution_id: string
          payment_date?: string | null
          payment_method?: string | null
          processed_at?: string | null
          session_id: string
          status?: string
          student_id: string
          total_amount: number
          transaction_ref: string
          updated_at?: string | null
          verification_hash?: string | null
          verification_response?: Json | null
          verified_amount?: number | null
        }
        Update: {
          bill_ids?: string[]
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          gateway_response?: Json | null
          gateway_transaction_id?: string | null
          id?: string
          institution_id?: string
          payment_date?: string | null
          payment_method?: string | null
          processed_at?: string | null
          session_id?: string
          status?: string
          student_id?: string
          total_amount?: number
          transaction_ref?: string
          updated_at?: string | null
          verification_hash?: string | null
          verification_response?: Json | null
          verified_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_transactions_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_transactions_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      periods: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          institution_id: string | null
          is_break: boolean | null
          period_name: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          institution_id?: string | null
          is_break?: boolean | null
          period_name: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          institution_id?: string | null
          is_break?: boolean | null
          period_name?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "periods_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      profile_change_audit_log: {
        Row: {
          action_type: string
          change_request_id: string | null
          changed_fields: Json
          comments: string | null
          created_at: string | null
          id: string
          learner_id: string
          performed_at: string | null
          performed_by: string | null
        }
        Insert: {
          action_type: string
          change_request_id?: string | null
          changed_fields: Json
          comments?: string | null
          created_at?: string | null
          id?: string
          learner_id: string
          performed_at?: string | null
          performed_by?: string | null
        }
        Update: {
          action_type?: string
          change_request_id?: string | null
          changed_fields?: Json
          comments?: string | null
          created_at?: string | null
          id?: string
          learner_id?: string
          performed_at?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_change_audit_log_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "profile_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_audit_log_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_audit_log_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "profile_change_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_change_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_change_requests: {
        Row: {
          changed_fields: Json
          created_at: string | null
          fields_summary: string[]
          id: string
          learner_id: string
          request_status: string
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
        }
        Insert: {
          changed_fields: Json
          created_at?: string | null
          fields_summary?: string[]
          id?: string
          learner_id: string
          request_status?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
        }
        Update: {
          changed_fields?: Json
          created_at?: string | null
          fields_summary?: string[]
          id?: string
          learner_id?: string
          request_status?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_change_requests_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "profile_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_change_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          institution_id: string | null
          is_active: boolean
          is_pre_registered: boolean | null
          is_super_admin: boolean | null
          last_login: string | null
          learner_id: string | null
          phone_number: string | null
          profile_completed: boolean
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          institution_id?: string | null
          is_active?: boolean
          is_pre_registered?: boolean | null
          is_super_admin?: boolean | null
          last_login?: string | null
          learner_id?: string | null
          phone_number?: string | null
          profile_completed?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean
          is_pre_registered?: boolean | null
          is_super_admin?: boolean | null
          last_login?: string | null
          learner_id?: string | null
          phone_number?: string | null
          profile_completed?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_department_id"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "profiles_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
        ]
      }
      profiles_backup_bpharm_sem8_active: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          department_id: string | null
          designation: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          institution_id: string | null
          is_active: boolean | null
          is_pre_registered: boolean | null
          is_super_admin: boolean | null
          last_login: string | null
          learner_id: string | null
          phone_number: string | null
          profile_completed: boolean | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string | null
          institution_id?: string | null
          is_active?: boolean | null
          is_pre_registered?: boolean | null
          is_super_admin?: boolean | null
          last_login?: string | null
          learner_id?: string | null
          phone_number?: string | null
          profile_completed?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string | null
          institution_id?: string | null
          is_active?: boolean | null
          is_pre_registered?: boolean | null
          is_super_admin?: boolean | null
          last_login?: string | null
          learner_id?: string | null
          phone_number?: string | null
          profile_completed?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string | null
          created_by: string | null
          degree_id: string | null
          department_id: string | null
          display_name: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          is_part_time: boolean | null
          pattern_type: string | null
          program_duration_yrs: number | null
          program_id: string
          program_name: string
          program_order: number | null
          program_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          degree_id?: string | null
          department_id?: string | null
          display_name?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_part_time?: boolean | null
          pattern_type?: string | null
          program_duration_yrs?: number | null
          program_id: string
          program_name: string
          program_order?: number | null
          program_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          degree_id?: string | null
          department_id?: string | null
          display_name?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_part_time?: boolean | null
          pattern_type?: string | null
          program_duration_yrs?: number | null
          program_id?: string
          program_name?: string
          program_order?: number | null
          program_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscription: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      regulations: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          is_active: boolean
          regulation_code: string
          regulation_year: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          is_active?: boolean
          regulation_code: string
          regulation_year: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          regulation_code?: string
          regulation_year?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      resource_approvals: {
        Row: {
          approval_level: number
          approved_at: string | null
          approver_user_id: string
          comments: string | null
          created_at: string | null
          escalated_at: string | null
          escalated_to: string | null
          escalation_reason: string | null
          id: string
          rejection_reason: string | null
          reservation_id: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string | null
        }
        Insert: {
          approval_level?: number
          approved_at?: string | null
          approver_user_id: string
          comments?: string | null
          created_at?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          id?: string
          rejection_reason?: string | null
          reservation_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string | null
        }
        Update: {
          approval_level?: number
          approved_at?: string | null
          approver_user_id?: string
          comments?: string | null
          created_at?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          id?: string
          rejection_reason?: string | null
          reservation_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_approvals_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_approvals_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_approvals_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_approvals_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_approvals_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "resource_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_attribute_definitions: {
        Row: {
          attribute_key: string
          attribute_type: Database["public"]["Enums"]["attribute_type"]
          created_at: string | null
          default_value: string | null
          description: string | null
          display_order: number | null
          id: string
          is_multiple: boolean | null
          is_required: boolean | null
          options: Json | null
          subcategory_id: string
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          attribute_key: string
          attribute_type: Database["public"]["Enums"]["attribute_type"]
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_multiple?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          subcategory_id: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          attribute_key?: string
          attribute_type?: Database["public"]["Enums"]["attribute_type"]
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_multiple?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          subcategory_id?: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_attribute_definitions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "resource_sub_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_maintenance_logs: {
        Row: {
          assigned_to_user_id: string | null
          attachments: Json | null
          completed_date: string | null
          cost: number | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          maintenance_type: string
          notes: string | null
          priority: number | null
          resource_id: string
          scheduled_date: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          attachments?: Json | null
          completed_date?: string | null
          cost?: number | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          maintenance_type: string
          notes?: string | null
          priority?: number | null
          resource_id: string
          scheduled_date: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          attachments?: Json | null
          completed_date?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          maintenance_type?: string
          notes?: string | null
          priority?: number | null
          resource_id?: string
          scheduled_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_maintenance_logs_assigned_to"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_maintenance_logs_assigned_to"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_maintenance_logs_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_maintenance_logs_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_maintenance_logs_resource"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_maintenance_schedules: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string | null
          description: string | null
          estimated_cost: number | null
          frequency_days: number
          id: string
          is_active: boolean | null
          last_maintenance_date: string | null
          maintenance_type: string
          next_maintenance_date: string
          reminder_days_before: number | null
          resource_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          frequency_days: number
          id?: string
          is_active?: boolean | null
          last_maintenance_date?: string | null
          maintenance_type: string
          next_maintenance_date: string
          reminder_days_before?: number | null
          resource_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          frequency_days?: number
          id?: string
          is_active?: boolean | null
          last_maintenance_date?: string | null
          maintenance_type?: string
          next_maintenance_date?: string
          reminder_days_before?: number | null
          resource_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_maintenance_schedules_assigned_to"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_maintenance_schedules_assigned_to"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_maintenance_schedules_resource"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_parent_categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          name: string
          status: Database["public"]["Enums"]["category_status"]
          updated_at: string | null
          updated_by: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          name: string
          status?: Database["public"]["Enums"]["category_status"]
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          name?: string
          status?: Database["public"]["Enums"]["category_status"]
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_parent_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_parent_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_parent_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_parent_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_reservations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachments: string[] | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          created_at: string | null
          end_time: string
          id: string
          is_recurring: boolean | null
          notes: string | null
          priority: number | null
          purpose: string
          quantity: number | null
          recurring_config: Json | null
          rejection_reason: string | null
          resource_id: string
          start_time: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachments?: string[] | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string | null
          end_time: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          priority?: number | null
          purpose: string
          quantity?: number | null
          recurring_config?: Json | null
          rejection_reason?: string | null
          resource_id: string
          start_time: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachments?: string[] | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string | null
          end_time?: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          priority?: number | null
          purpose?: string
          quantity?: number | null
          recurring_config?: Json | null
          rejection_reason?: string | null
          resource_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_reservations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_reservations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_reservations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_reservations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_reservations_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_sub_categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          inherit_parent_attributes: boolean | null
          name: string
          parent_category_id: string
          status: Database["public"]["Enums"]["category_status"]
          updated_at: string | null
          updated_by: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          inherit_parent_attributes?: boolean | null
          name: string
          parent_category_id: string
          status?: Database["public"]["Enums"]["category_status"]
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          inherit_parent_attributes?: boolean | null
          name?: string
          parent_category_id?: string
          status?: Database["public"]["Enums"]["category_status"]
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_sub_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_sub_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_sub_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "resource_parent_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_sub_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_sub_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_usage_logs: {
        Row: {
          action: string
          actual_duration: unknown
          additional_data: Json | null
          created_at: string | null
          end_time: string | null
          id: string
          ip_address: unknown
          reservation_id: string | null
          resource_id: string
          start_time: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          actual_duration?: unknown
          additional_data?: Json | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          ip_address?: unknown
          reservation_id?: string | null
          resource_id: string
          start_time?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actual_duration?: unknown
          additional_data?: Json | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          ip_address?: unknown
          reservation_id?: string | null
          resource_id?: string
          start_time?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_usage_logs_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "resource_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_usage_logs_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resource_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          access_roles: string[] | null
          approval_config: Json | null
          block_number: string | null
          booking_config: Json | null
          booking_type: string
          building_number: string | null
          caretaker_user_id: string | null
          caretaker_user_ids: string[] | null
          created_at: string | null
          created_by: string | null
          current_stock_quantity: number | null
          current_value: number | null
          custom_attributes: Json | null
          department_id: string | null
          depreciation_rate: number | null
          description: string
          disposal_date: string | null
          floor_number: string | null
          id: string
          image_urls: string[] | null
          initial_stock_quantity: number | null
          institution_id: string | null
          location_notes: string | null
          maintenance_schedule: string | null
          name: string
          parent_category_id: string
          purchase_date: string | null
          reminder_config: Json | null
          reservation_count: number | null
          resource_code: string | null
          room_number: string | null
          status: Database["public"]["Enums"]["resource_status"]
          subcategory_id: string
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
          usage_count: number | null
          vendor_address_line1: string | null
          vendor_address_line2: string | null
          vendor_city: string | null
          vendor_contract_details: string | null
          vendor_email: string | null
          vendor_mobile: string | null
          vendor_name: string | null
          vendor_state: string | null
          vendor_support_contact: string | null
          vendor_zip: string | null
          warranty_expiry_date: string | null
        }
        Insert: {
          access_roles?: string[] | null
          approval_config?: Json | null
          block_number?: string | null
          booking_config?: Json | null
          booking_type?: string
          building_number?: string | null
          caretaker_user_id?: string | null
          caretaker_user_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          current_stock_quantity?: number | null
          current_value?: number | null
          custom_attributes?: Json | null
          department_id?: string | null
          depreciation_rate?: number | null
          description: string
          disposal_date?: string | null
          floor_number?: string | null
          id?: string
          image_urls?: string[] | null
          initial_stock_quantity?: number | null
          institution_id?: string | null
          location_notes?: string | null
          maintenance_schedule?: string | null
          name: string
          parent_category_id: string
          purchase_date?: string | null
          reminder_config?: Json | null
          reservation_count?: number | null
          resource_code?: string | null
          room_number?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          subcategory_id: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
          vendor_address_line1?: string | null
          vendor_address_line2?: string | null
          vendor_city?: string | null
          vendor_contract_details?: string | null
          vendor_email?: string | null
          vendor_mobile?: string | null
          vendor_name?: string | null
          vendor_state?: string | null
          vendor_support_contact?: string | null
          vendor_zip?: string | null
          warranty_expiry_date?: string | null
        }
        Update: {
          access_roles?: string[] | null
          approval_config?: Json | null
          block_number?: string | null
          booking_config?: Json | null
          booking_type?: string
          building_number?: string | null
          caretaker_user_id?: string | null
          caretaker_user_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          current_stock_quantity?: number | null
          current_value?: number | null
          custom_attributes?: Json | null
          department_id?: string | null
          depreciation_rate?: number | null
          description?: string
          disposal_date?: string | null
          floor_number?: string | null
          id?: string
          image_urls?: string[] | null
          initial_stock_quantity?: number | null
          institution_id?: string | null
          location_notes?: string | null
          maintenance_schedule?: string | null
          name?: string
          parent_category_id?: string
          purchase_date?: string | null
          reminder_config?: Json | null
          reservation_count?: number | null
          resource_code?: string | null
          room_number?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          subcategory_id?: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
          vendor_address_line1?: string | null
          vendor_address_line2?: string | null
          vendor_city?: string | null
          vendor_contract_details?: string | null
          vendor_email?: string | null
          vendor_mobile?: string | null
          vendor_name?: string | null
          vendor_state?: string | null
          vendor_support_contact?: string | null
          vendor_zip?: string | null
          warranty_expiry_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "resources_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "resource_parent_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "resource_sub_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resources_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          degree_id: string | null
          department_id: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          program_id: string | null
          section_name: string
          semester_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          degree_id?: string | null
          department_id?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          program_id?: string | null
          section_name: string
          semester_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          degree_id?: string | null
          department_id?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          program_id?: string | null
          section_name?: string
          semester_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "sections_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          created_at: string
          degree_id: string
          department_id: string
          id: string
          initial_semester: boolean | null
          institution_id: string
          is_active: boolean | null
          program_id: string
          semester_code: string
          semester_group: string | null
          semester_name: string
          semester_order: number | null
          semester_type: string
          terminal_semester: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          degree_id: string
          department_id: string
          id?: string
          initial_semester?: boolean | null
          institution_id: string
          is_active?: boolean | null
          program_id: string
          semester_code: string
          semester_group?: string | null
          semester_name: string
          semester_order?: number | null
          semester_type: string
          terminal_semester?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          degree_id?: string
          department_id?: string
          id?: string
          initial_semester?: boolean | null
          institution_id?: string
          is_active?: boolean | null
          program_id?: string
          semester_code?: string
          semester_group?: string | null
          semester_name?: string
          semester_order?: number | null
          semester_type?: string
          terminal_semester?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "semesters_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          blood_group: string | null
          category_id: string
          created_at: string
          created_by: string | null
          date_of_birth: string
          date_of_joining: string
          department_id: string
          designation: string
          district: string | null
          email: string
          first_name: string
          gender: string
          id: string
          institution_email: string
          institution_id: string
          is_active: boolean | null
          last_name: string
          marital_status: string
          phone: string
          pincode: string | null
          profile_id: string | null
          profile_picture: string | null
          staff_id: string | null
          state: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          blood_group?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          date_of_birth: string
          date_of_joining: string
          department_id: string
          designation: string
          district?: string | null
          email: string
          first_name: string
          gender: string
          id?: string
          institution_email: string
          institution_id: string
          is_active?: boolean | null
          last_name: string
          marital_status: string
          phone: string
          pincode?: string | null
          profile_id?: string | null
          profile_picture?: string | null
          staff_id?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          blood_group?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string
          date_of_joining?: string
          department_id?: string
          designation?: string
          district?: string | null
          email?: string
          first_name?: string
          gender?: string
          id?: string
          institution_email?: string
          institution_id?: string
          is_active?: boolean | null
          last_name?: string
          marital_status?: string
          phone?: string
          pincode?: string | null
          profile_id?: string | null
          profile_picture?: string | null
          staff_id?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "employment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_plan_courses: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          is_combined: boolean | null
          staff_id: string
          staff_plan_id: string
          staff_type: string
          updated_at: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          is_combined?: boolean | null
          staff_id: string
          staff_plan_id: string
          staff_type: string
          updated_at?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          is_combined?: boolean | null
          staff_id?: string
          staff_plan_id?: string
          staff_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plan_courses_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plan_courses_staff_plan_id_fkey"
            columns: ["staff_plan_id"]
            isOneToOne: false
            referencedRelation: "staff_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_plans: {
        Row: {
          academic_year_id: string
          created_at: string | null
          degree_id: string
          department_id: string
          end_date: string
          id: string
          institution_id: string
          is_active: boolean | null
          program_id: string
          semester_id: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          academic_year_id: string
          created_at?: string | null
          degree_id: string
          department_id: string
          end_date: string
          id?: string
          institution_id: string
          is_active?: boolean | null
          program_id: string
          semester_id: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          academic_year_id?: string
          created_at?: string | null
          degree_id?: string
          department_id?: string
          end_date?: string
          id?: string
          institution_id?: string
          is_active?: boolean | null
          program_id?: string
          semester_id?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plans_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plans_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plans_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plans_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "staff_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_plans_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      student_attendance: {
        Row: {
          academic_year_id: string | null
          attendance_data: Json
          attendance_date: string
          created_at: string
          degree_id: string | null
          department_id: string | null
          id: string
          institution_id: string
          period_slot_id: string | null
          program_id: string | null
          section_id: string
          section_ids: string[] | null
          semester_id: string | null
          timetable_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          attendance_data?: Json
          attendance_date: string
          created_at?: string
          degree_id?: string | null
          department_id?: string | null
          id?: string
          institution_id: string
          period_slot_id?: string | null
          program_id?: string | null
          section_id: string
          section_ids?: string[] | null
          semester_id?: string | null
          timetable_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          attendance_data?: Json
          attendance_date?: string
          created_at?: string
          degree_id?: string | null
          department_id?: string | null
          id?: string
          institution_id?: string
          period_slot_id?: string | null
          program_id?: string | null
          section_id?: string
          section_ids?: string[] | null
          semester_id?: string | null
          timetable_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_student_attendance_academic_year"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_student_attendance_degree"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_student_attendance_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_student_attendance_program"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_student_attendance_semester"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "student_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      student_attendance_backup_20251223: {
        Row: {
          academic_year_id: string | null
          attendance_data: Json | null
          attendance_date: string | null
          created_at: string | null
          degree_id: string | null
          department_id: string | null
          id: string | null
          institution_id: string | null
          period_slot_id: string | null
          program_id: string | null
          section_id: string | null
          section_ids: string[] | null
          semester_id: string | null
          timetable_id: string | null
          updated_at: string | null
        }
        Insert: {
          academic_year_id?: string | null
          attendance_data?: Json | null
          attendance_date?: string | null
          created_at?: string | null
          degree_id?: string | null
          department_id?: string | null
          id?: string | null
          institution_id?: string | null
          period_slot_id?: string | null
          program_id?: string | null
          section_id?: string | null
          section_ids?: string[] | null
          semester_id?: string | null
          timetable_id?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_year_id?: string | null
          attendance_data?: Json | null
          attendance_date?: string | null
          created_at?: string | null
          degree_id?: string | null
          department_id?: string | null
          id?: string | null
          institution_id?: string | null
          period_slot_id?: string | null
          program_id?: string | null
          section_id?: string | null
          section_ids?: string[] | null
          semester_id?: string | null
          timetable_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      student_engagement_scores: {
        Row: {
          avg_session_duration_minutes: number | null
          calculation_date: string
          created_at: string
          days_since_last_login: number | null
          department_id: string | null
          engagement_level: string | null
          id: string
          institution_id: string
          is_at_risk: boolean
          last_login_at: string | null
          logins_last_30_days: number
          logins_last_7_days: number
          modules_accessed_count: number
          percentile_rank: number | null
          program_id: string | null
          risk_factors: string[] | null
          section_avg_duration: number | null
          section_avg_logins_7d: number | null
          section_id: string | null
          semester_id: string | null
          total_time_spent_hours: number | null
          unique_modules_accessed: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_session_duration_minutes?: number | null
          calculation_date: string
          created_at?: string
          days_since_last_login?: number | null
          department_id?: string | null
          engagement_level?: string | null
          id?: string
          institution_id: string
          is_at_risk?: boolean
          last_login_at?: string | null
          logins_last_30_days?: number
          logins_last_7_days?: number
          modules_accessed_count?: number
          percentile_rank?: number | null
          program_id?: string | null
          risk_factors?: string[] | null
          section_avg_duration?: number | null
          section_avg_logins_7d?: number | null
          section_id?: string | null
          semester_id?: string | null
          total_time_spent_hours?: number | null
          unique_modules_accessed?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_session_duration_minutes?: number | null
          calculation_date?: string
          created_at?: string
          days_since_last_login?: number | null
          department_id?: string | null
          engagement_level?: string | null
          id?: string
          institution_id?: string
          is_at_risk?: boolean
          last_login_at?: string | null
          logins_last_30_days?: number
          logins_last_7_days?: number
          modules_accessed_count?: number
          percentile_rank?: number | null
          program_id?: string | null
          risk_factors?: string[] | null
          section_avg_duration?: number | null
          section_avg_logins_7d?: number | null
          section_id?: string | null
          semester_id?: string | null
          total_time_spent_hours?: number | null
          unique_modules_accessed?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_student_engagement_scores_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_student_engagement_scores_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "student_engagement_scores_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      students_backup_20251223: {
        Row: {
          aadhar_number: string | null
          academic_year_id: string | null
          accommodation_type: string | null
          admission_id: string | null
          annual_income: string | null
          application_id: string | null
          batch_id: string | null
          board_of_study: string | null
          bus_pickup_location: string | null
          bus_required: boolean | null
          bus_route: string | null
          caste: string | null
          category: string | null
          college_email: string | null
          community: string | null
          counseling_applied: boolean | null
          counseling_number: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          degree_id: string | null
          department_id: string | null
          engineering_cutoff_marks: string | null
          entry_type: string | null
          father_mobile: string | null
          father_name: string | null
          father_occupation: string | null
          first_graduate: boolean | null
          first_name: string | null
          food_type: string | null
          gender: string | null
          hostel_type: string | null
          id: string | null
          institution_id: string | null
          is_profile_complete: boolean | null
          last_name: string | null
          last_school: string | null
          medical_cutoff_marks: string | null
          mother_mobile: string | null
          mother_name: string | null
          mother_occupation: string | null
          neet_roll_number: string | null
          neet_score: string | null
          permanent_address_district: string | null
          permanent_address_pin_code: string | null
          permanent_address_state: string | null
          permanent_address_street: string | null
          permanent_address_taluk: string | null
          program_id: string | null
          quota: string | null
          reference_contact: string | null
          reference_name: string | null
          reference_type: string | null
          register_number: string | null
          regulation_id: string | null
          religion: string | null
          roll_number: string | null
          section_id: string | null
          semester_id: string | null
          status: Database["public"]["Enums"]["student_status"] | null
          student_email: string | null
          student_mobile: string | null
          student_photo_url: string | null
          tenth_marks: Json | null
          twelfth_marks: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string | null
          admission_id?: string | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          board_of_study?: string | null
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string | null
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          entry_type?: string | null
          father_mobile?: string | null
          father_name?: string | null
          father_occupation?: string | null
          first_graduate?: boolean | null
          first_name?: string | null
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string | null
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          medical_cutoff_marks?: string | null
          mother_mobile?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          permanent_address_district?: string | null
          permanent_address_pin_code?: string | null
          permanent_address_state?: string | null
          permanent_address_street?: string | null
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string | null
          roll_number?: string | null
          section_id?: string | null
          semester_id?: string | null
          status?: Database["public"]["Enums"]["student_status"] | null
          student_email?: string | null
          student_mobile?: string | null
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          aadhar_number?: string | null
          academic_year_id?: string | null
          accommodation_type?: string | null
          admission_id?: string | null
          annual_income?: string | null
          application_id?: string | null
          batch_id?: string | null
          board_of_study?: string | null
          bus_pickup_location?: string | null
          bus_required?: boolean | null
          bus_route?: string | null
          caste?: string | null
          category?: string | null
          college_email?: string | null
          community?: string | null
          counseling_applied?: boolean | null
          counseling_number?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          degree_id?: string | null
          department_id?: string | null
          engineering_cutoff_marks?: string | null
          entry_type?: string | null
          father_mobile?: string | null
          father_name?: string | null
          father_occupation?: string | null
          first_graduate?: boolean | null
          first_name?: string | null
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string | null
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          medical_cutoff_marks?: string | null
          mother_mobile?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          neet_roll_number?: string | null
          neet_score?: string | null
          permanent_address_district?: string | null
          permanent_address_pin_code?: string | null
          permanent_address_state?: string | null
          permanent_address_street?: string | null
          permanent_address_taluk?: string | null
          program_id?: string | null
          quota?: string | null
          reference_contact?: string | null
          reference_name?: string | null
          reference_type?: string | null
          register_number?: string | null
          regulation_id?: string | null
          religion?: string | null
          roll_number?: string | null
          section_id?: string | null
          semester_id?: string | null
          status?: Database["public"]["Enums"]["student_status"] | null
          student_email?: string | null
          student_mobile?: string | null
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      timetables: {
        Row: {
          academic_year_id: string | null
          created_at: string | null
          created_by: string | null
          created_from_template_id: string | null
          degree_id: string | null
          department_id: string | null
          end_date: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          is_template: boolean | null
          migrated_from_old_structure: boolean | null
          migration_timestamp: string | null
          periods: Json
          program_id: string | null
          section_id: string | null
          selected_dates: Json | null
          selected_days: Json | null
          semester_id: string | null
          start_date: string | null
          template_category: string | null
          template_description: string | null
          template_name: string | null
          template_tags: Json | null
          timetable_data: Json
          timetable_format: string
          timetable_name: string
          timetable_type: string | null
          updated_at: string | null
          usage_count: number | null
          version: number | null
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_from_template_id?: string | null
          degree_id?: string | null
          department_id?: string | null
          end_date?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_template?: boolean | null
          migrated_from_old_structure?: boolean | null
          migration_timestamp?: string | null
          periods?: Json
          program_id?: string | null
          section_id?: string | null
          selected_dates?: Json | null
          selected_days?: Json | null
          semester_id?: string | null
          start_date?: string | null
          template_category?: string | null
          template_description?: string | null
          template_name?: string | null
          template_tags?: Json | null
          timetable_data?: Json
          timetable_format?: string
          timetable_name: string
          timetable_type?: string | null
          updated_at?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_from_template_id?: string | null
          degree_id?: string | null
          department_id?: string | null
          end_date?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_template?: boolean | null
          migrated_from_old_structure?: boolean | null
          migration_timestamp?: string | null
          periods?: Json
          program_id?: string | null
          section_id?: string | null
          selected_dates?: Json | null
          selected_days?: Json | null
          semester_id?: string | null
          start_date?: string | null
          template_category?: string | null
          template_description?: string | null
          template_name?: string | null
          template_tags?: Json | null
          timetable_data?: Json
          timetable_format?: string
          timetable_name?: string
          timetable_type?: string | null
          updated_at?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "timetables_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_created_from_template_id_fkey"
            columns: ["created_from_template_id"]
            isOneToOne: false
            referencedRelation: "timetables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "timetables_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          action_type: string
          created_at: string | null
          description: string
          id: string
          institution_id: string | null
          ip_address: unknown
          metadata: Json | null
          request_method: string | null
          request_url: string | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string | null
          session_id: string | null
          status_code: number | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description: string
          id?: string
          institution_id?: string | null
          ip_address?: unknown
          metadata?: Json | null
          request_method?: string | null
          request_url?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
          session_id?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string
          id?: string
          institution_id?: string | null
          ip_address?: unknown
          metadata?: Json | null
          request_method?: string | null
          request_url?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
          session_id?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_app_favorites: {
        Row: {
          application_id: string
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_app_favorites_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_institution_access: {
        Row: {
          access_type: string
          created_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          institution_id: string
          is_active: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_type?: string
          created_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_type?: string
          created_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_institution_access_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_institution_access_institution"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "user_institution_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_institution_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_institution_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_institution_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          is_primary: boolean | null
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          is_primary?: boolean | null
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          is_primary?: boolean | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          actions_count: number | null
          created_at: string
          department_id: string | null
          device_type: string | null
          duration_seconds: number | null
          id: string
          institution_id: string | null
          ip_address: unknown
          is_active: boolean
          login_at: string
          logout_at: string | null
          modules_accessed: string[] | null
          program_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          section_id: string | null
          semester_id: string | null
          session_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          actions_count?: number | null
          created_at?: string
          department_id?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          id?: string
          institution_id?: string | null
          ip_address?: unknown
          is_active?: boolean
          login_at?: string
          logout_at?: string | null
          modules_accessed?: string[] | null
          program_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          section_id?: string | null
          semester_id?: string | null
          session_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          actions_count?: number | null
          created_at?: string
          department_id?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          id?: string
          institution_id?: string | null
          ip_address?: unknown
          is_active?: boolean
          login_at?: string
          logout_at?: string | null
          modules_accessed?: string[] | null
          program_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          section_id?: string | null
          semester_id?: string | null
          session_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "user_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string
          http_status: number | null
          id: string
          payload: Json
          record_id: string
          table_name: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          payload: Json
          record_id: string
          table_name: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          payload?: Json
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      activity_stats: {
        Row: {
          action_type: string | null
          activity_date: string | null
          activity_hour: number | null
          resource_type: string | null
          total_activities: number | null
          unique_sessions: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      billing_deletion_dependencies: {
        Row: {
          bill_id: string | null
          receipt_items_count: number | null
          refunds_count: number | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_billing_student_bills_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_billing_student_bills_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
        ]
      }
      bug_reporters_leaderboard: {
        Row: {
          avatar_url: string | null
          resolved_bugs_count: number | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: []
      }
      bug_reports_with_details: {
        Row: {
          console_logs: Json | null
          created_at: string | null
          department_code: string | null
          department_id: string | null
          department_name: string | null
          description: string | null
          display_id: string | null
          id: string | null
          institution_id: string | null
          institution_name: string | null
          metadata: Json | null
          page_url: string | null
          reporter_email: string | null
          reporter_name: string | null
          reporter_role: string | null
          reporter_user_id: string | null
          resolved_at: string | null
          screenshot_url: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_engagement_overview: {
        Row: {
          active_last_7d: number | null
          at_risk_count: number | null
          at_risk_engagement_count: number | null
          avg_logins_7d: number | null
          avg_percentile_rank: number | null
          avg_session_duration: number | null
          department_id: string | null
          high_engagement_count: number | null
          institution_id: string | null
          latest_calculation_date: string | null
          low_engagement_count: number | null
          medium_engagement_count: number | null
          program_id: string | null
          section_id: string | null
          semester_id: string | null
          total_students: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_engagement_scores_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "student_engagement_scores_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_engagement_scores_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semester_hierarchy_health: {
        Row: {
          institution_id: string | null
          institution_name: string | null
          total_learners: number | null
          total_programs: number | null
          total_sections: number | null
          total_semesters: number | null
        }
        Relationships: []
      }
      semester_program_audit_view: {
        Row: {
          consistency_status: string | null
          learner_id: string | null
          learner_name: string | null
          roll_number: string | null
          section_name: string | null
          section_program_id: string | null
          semester_name: string | null
          semester_program_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_program_id_fkey"
            columns: ["section_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_program_id_fkey"
            columns: ["semester_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_auth_code_to_bucket: { Args: { p_code_data: Json }; Returns: Json }
      add_module_to_session: {
        Args: { p_module_name: string; p_session_id: string }
        Returns: undefined
      }
      add_user_session: {
        Args: { p_app_id: string; p_session_data: Json; p_user_id: string }
        Returns: undefined
      }
      ai_get_accessible_institutions: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      ai_rpc_academic_context: {
        Args: { p_institution_id?: string }
        Returns: Json
      }
      ai_rpc_academic_years: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_admission_analytics: {
        Args: {
          p_academic_year_id?: string
          p_include_trends?: boolean
          p_institution_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_admission_details: {
        Args: {
          p_admission_id?: string
          p_application_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_admission_referrers: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_department_id?: string
          p_include_details?: boolean
          p_institution_id?: string
          p_program_id?: string
          p_reference_name?: string
          p_reference_type?: string
          p_status?: string
          p_top_n?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_admission_statistics: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_group_by?: string
          p_institution_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_admissions: {
        Args: {
          p_accommodation_type?: string
          p_bus_required?: boolean
          p_category?: string
          p_community?: string
          p_counseling_applied?: boolean
          p_date_from?: string
          p_date_to?: string
          p_degree_id?: string
          p_department_id?: string
          p_district?: string
          p_entry_type?: string
          p_first_graduate?: boolean
          p_gender?: string
          p_include_stats?: boolean
          p_institution_id?: string
          p_program_id?: string
          p_quota?: string
          p_religion?: string
          p_search?: string
          p_state?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_admissions_by_location: {
        Args: {
          p_city?: string
          p_district?: string
          p_include_stats?: boolean
          p_state?: string
          p_status?: string
          p_taluk?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_app_favorites: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      ai_rpc_applications_hub: {
        Args: {
          p_category_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_attendance: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_section_id?: string
          p_student_id?: string
          p_threshold?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_attendance_defaulters: {
        Args: {
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_semester?: string
          p_threshold?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_attendance_summary: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_department_id?: string
          p_section_id?: string
          p_student_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_billing_categories: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_bug_report_details: {
        Args: { p_bug_report_id: string; p_user_id: string }
        Returns: Json
      }
      ai_rpc_bug_reports: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_priority?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_bulk_notification: {
        Args: {
          p_message: string
          p_priority?: string
          p_recipient_ids: string[]
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_courses: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_custom_roles: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      ai_rpc_dashboard_widgets: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      ai_rpc_degrees: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_departments: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_employment_categories: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      ai_rpc_export_data: {
        Args: { p_data_source: string; p_filters?: Json; p_user_id: string }
        Returns: Json
      }
      ai_rpc_faculty_assignments: {
        Args: {
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_staff_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_fee_defaulters: {
        Args: {
          p_department_id?: string
          p_due_before?: string
          p_limit?: number
          p_min_amount?: number
          p_offset?: number
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_hierarchy_summary: {
        Args: { p_institution_id?: string; p_user_id: string }
        Returns: Json
      }
      ai_rpc_institution_access: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_target_user_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_kpi_summary: {
        Args: { p_institution_id?: string; p_user_id: string }
        Returns: Json
      }
      ai_rpc_learners_by_location: {
        Args: {
          p_city?: string
          p_department_id?: string
          p_district?: string
          p_include_stats?: boolean
          p_limit?: number
          p_offset?: number
          p_state?: string
          p_status?: string
          p_taluk?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_learners_comprehensive: {
        Args: {
          p_accommodation_type?: string
          p_bus_required?: boolean
          p_community?: string
          p_department_id?: string
          p_district?: string
          p_entry_type?: string
          p_first_graduate?: boolean
          p_gender?: string
          p_include_stats?: boolean
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_program_id?: string
          p_quota?: string
          p_religion?: string
          p_search?: string
          p_semester_id?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_mark_notification_read: {
        Args: { p_notification_ids: string[]; p_user_id: string }
        Returns: Json
      }
      ai_rpc_my_bug_reports:
        | {
            Args: { p_limit?: number; p_offset?: number; p_user_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_status?: string
              p_user_id: string
            }
            Returns: Json
          }
      ai_rpc_notifications: {
        Args: {
          p_is_read?: boolean
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_periods: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_programs: {
        Args: {
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_push_subscriptions: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      ai_rpc_sections: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_semester_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_semesters: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_program_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_send_notification: {
        Args: {
          p_message: string
          p_priority?: string
          p_recipient_ids: string[]
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_staff: {
        Args: {
          p_department_id?: string
          p_employment_category_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_staff_by_department: {
        Args: {
          p_department_id: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_staff_details: {
        Args: { p_staff_id: string; p_user_id: string }
        Returns: Json
      }
      ai_rpc_staff_plans: {
        Args: {
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_timetable_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_student_bills: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_section_id?: string
          p_status?: string
          p_student_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_student_details: {
        Args: { p_student_id: string; p_user_id: string }
        Returns: Json
      }
      ai_rpc_student_search: {
        Args: {
          p_department_id?: string
          p_exact_match?: boolean
          p_limit?: number
          p_offset?: number
          p_search_fields?: string[]
          p_search_query?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_students: {
        Args: {
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_program_id?: string
          p_search?: string
          p_section_id?: string
          p_semester_id?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_students_by_department: {
        Args: {
          p_institution_id?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_students_by_status: {
        Args: {
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_students_summary: {
        Args: {
          p_department_id?: string
          p_institution_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_timetable_slots: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_timetable_id: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_timetables: {
        Args: {
          p_academic_year_id?: string
          p_department_id?: string
          p_limit?: number
          p_offset?: number
          p_section_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_unread_notifications: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: Json
      }
      ai_rpc_user_context: { Args: { p_user_id: string }; Returns: Json }
      ai_rpc_user_roles: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_target_user_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_users: {
        Args: {
          p_institution_id?: string
          p_limit?: number
          p_offset?: number
          p_role?: string
          p_search?: string
          p_user_id: string
        }
        Returns: Json
      }
      ai_rpc_validate_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      analyze_faculty_corrections: {
        Args: never
        Returns: {
          attendance_date: string
          attendance_id: string
          correct_course: string
          correct_faculty: string
          current_course: string
          current_faculty: string
          match_method: string
          needs_update: boolean
          period_id: string
          period_name: string
        }[]
      }
      api_key_has_permission: {
        Args: { permission_name: string }
        Returns: boolean
      }
      bulk_calculate_student_outstanding: {
        Args: { student_ids: string[] }
        Returns: {
          outstanding_amount: number
          student_id: string
        }[]
      }
      bulk_sync_applications_to_auth_server: {
        Args: never
        Returns: {
          app_id: string
          app_name: string
          sync_message: string
          sync_status: string
        }[]
      }
      bulk_sync_user_to_auth_server: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      calculate_student_outstanding: {
        Args: { student_uuid: string }
        Returns: number
      }
      calculate_student_outstanding_optimized: {
        Args: { student_uuid: string }
        Returns: number
      }
      can_access_profile: {
        Args: { target_id: string; user_id: string }
        Returns: boolean
      }
      can_manage_user_roles: {
        Args: { checking_user_id: string }
        Returns: boolean
      }
      can_user_access_attendance: {
        Args: { attendance_record_id: string; user_id: string }
        Returns: boolean
      }
      can_user_manage_staff: { Args: never; Returns: boolean }
      check_ai_query_rate_limit: { Args: { p_user_id: string }; Returns: Json }
      check_attendance_data_integrity: {
        Args: never
        Returns: {
          attendance_date: string
          integrity_score: number
          mismatched_periods: number
          timetable_id: string
          timetable_name: string
          total_attendance_records: number
        }[]
      }
      check_billing_system_status: {
        Args: never
        Returns: {
          check_status: string
          component: string
          count_value: number
          details: string
        }[]
      }
      check_digital_reservation_conflict: {
        Args: {
          p_digital_resource_id: string
          p_end_datetime: string
          p_max_concurrent_users: number
          p_reservation_id?: string
          p_start_datetime: string
        }
        Returns: boolean
      }
      check_email_available: { Args: { check_email: string }; Returns: boolean }
      check_orphaned_auth_users: {
        Args: never
        Returns: {
          created_at: string
          user_email: string
          user_id: string
        }[]
      }
      check_orphaned_profiles: {
        Args: never
        Returns: {
          created_at: string
          profile_email: string
          profile_id: string
          profile_role: string
        }[]
      }
      check_permission: { Args: { permission_key: string }; Returns: boolean }
      check_reservation_conflict: {
        Args: {
          p_end_datetime: string
          p_reservation_id?: string
          p_resource_id: string
          p_start_datetime: string
        }
        Returns: boolean
      }
      check_resource_availability: {
        Args: {
          p_end_time: string
          p_exclude_reservation_id?: string
          p_quantity?: number
          p_resource_id: string
          p_start_time: string
        }
        Returns: boolean
      }
      check_staff_timetable_conflicts: {
        Args: {
          p_day_of_week: string
          p_exclude_timetable_id?: string
          p_period_id: string
          p_staff_id: string
        }
        Returns: boolean
      }
      check_user_conflicts: {
        Args: { check_email: string; check_user_id?: string }
        Returns: {
          conflict_email: string
          conflict_id: string
          conflict_type: string
          has_profile: boolean
        }[]
      }
      cleanup_expired_auth_buckets: { Args: never; Returns: number }
      cleanup_migrated_staff_profiles: {
        Args: never
        Returns: {
          email: string
          new_profile_id: string
          old_profile_id: string
          staff_id: string
          status: string
        }[]
      }
      cleanup_old_logs: { Args: { days?: number }; Returns: number }
      cleanup_old_webhook_logs: { Args: never; Returns: undefined }
      cleanup_orphaned_auth_users: {
        Args: never
        Returns: {
          cleaned_email: string
          cleaned_user_id: string
        }[]
      }
      cleanup_orphaned_sessions: { Args: never; Returns: number }
      cleanup_user_expired_sessions: {
        Args: { p_user_id: string }
        Returns: number
      }
      close_user_session: {
        Args: { p_logout_at?: string; p_session_id: string }
        Returns: undefined
      }
      compute_daily_engagement_metrics: {
        Args: { p_target_date?: string }
        Returns: number
      }
      compute_student_engagement_scores: {
        Args: { p_target_date?: string }
        Returns: number
      }
      convert_to_date: { Args: { input_date: string }; Returns: string }
      create_api_key: {
        Args: { p_name: string; p_scopes: string[]; p_user_id: string }
        Returns: {
          id: string
          key_value: string
        }[]
      }
      create_missing_profiles: {
        Args: never
        Returns: {
          error_message: string
          success: boolean
          user_email: string
          user_id: string
        }[]
      }
      create_preregistered_profile: {
        Args: {
          profile_department_id?: string
          profile_email: string
          profile_full_name: string
          profile_id: string
          profile_institution_id?: string
          profile_phone?: string
          profile_role: string
        }
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          institution_id: string | null
          is_active: boolean
          is_pre_registered: boolean | null
          is_super_admin: boolean | null
          last_login: string | null
          learner_id: string | null
          phone_number: string | null
          profile_completed: boolean
          role: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_staff_auth_profile: {
        Args: {
          staff_email: string
          staff_full_name: string
          staff_institution_id: string
          staff_phone: string
        }
        Returns: Json
      }
      create_user_profile: {
        Args: {
          user_email: string
          user_full_name: string
          user_id: string
          user_institution_id?: string
          user_phone_number?: string
          user_role: string
        }
        Returns: string
      }
      current_user_can_access_timetable: {
        Args: { timetable_id: string }
        Returns: boolean
      }
      debug_auth_profile_mismatch: {
        Args: never
        Returns: {
          auth_created: string
          auth_email: string
          auth_id: string
          has_profile: boolean
        }[]
      }
      debug_check_permission: {
        Args: { permission_key: string }
        Returns: string
      }
      debug_staff_creation_permissions: {
        Args: never
        Returns: {
          can_create_staff: boolean
          current_user_id: string
          debug_info: string
          institution_id: string
          is_super_admin: boolean
          user_role: string
        }[]
      }
      debug_staff_sync_issue: {
        Args: { p_course_name: string; p_institution_name?: string }
        Returns: {
          description: string
          issue_type: string
          recommendations: string
          staff_plan_context: Json
          timetable_context: Json
        }[]
      }
      delete_bill_with_cascade: {
        Args: { bill_id_param: string }
        Returns: {
          deleted_count: number
          deleted_table: string
          details: Json
        }[]
      }
      delete_timetable_slot: {
        Args: {
          p_day_of_week: string
          p_is_batch?: boolean
          p_period_id: string
          p_timetable_id: string
        }
        Returns: Json
      }
      ensure_student_role: { Args: never; Returns: string }
      find_correct_semester_for_student: {
        Args: {
          p_current_semester_name: string
          p_program_id: string
          p_student_id: string
        }
        Returns: string
      }
      find_timetable_staff_conflicts_for_course: {
        Args: { p_course_id: string; p_staff_id: string }
        Returns: {
          day_key: string
          section: string
          semester: string
          slot_key: string
          timetable_id: string
          timetable_name: string
        }[]
      }
      find_timetables_by_course: {
        Args: { course_uuid: string }
        Returns: {
          course_slots: Json
          timetable_id: string
          timetable_name: string
        }[]
      }
      find_timetables_by_staff: {
        Args: { staff_uuid: string }
        Returns: {
          matching_slots: Json
          timetable_id: string
          timetable_name: string
        }[]
      }
      fix_attendance_period_mapping: {
        Args: {
          p_attendance_id: string
          p_new_period_id: string
          p_old_period_id: string
        }
        Returns: boolean
      }
      generate_api_key:
        | { Args: never; Returns: string }
        | { Args: { length?: number }; Returns: string }
      generate_auto_invoice_for_bill: {
        Args: { p_bill_id: string }
        Returns: string
      }
      generate_bug_display_id: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      generate_learner_application_id: {
        Args: { institution_id_param: string }
        Returns: string
      }
      generate_receipt_number: { Args: never; Returns: string }
      generate_temp_password: { Args: never; Returns: string }
      generate_usage_report: {
        Args: {
          p_end_date: string
          p_resource_id: string
          p_start_date: string
        }
        Returns: string
      }
      get_all_timetable_slots: {
        Args: { p_timetable_id: string }
        Returns: {
          slot: Json
        }[]
      }
      get_all_timetable_staff_conflicts: {
        Args: never
        Returns: {
          conflict_type: string
          course_id: string
          course_name: string
          planned_staff_id: string
          planned_staff_name: string
          section: string
          semester: string
          timetable_id: string
          timetable_name: string
          timetable_staff_id: string
          timetable_staff_name: string
        }[]
      }
      get_app_usage_stats: {
        Args: { p_app_id: string; p_days?: number }
        Returns: {
          date: string
          error_rate: number
          total_api_calls: number
          total_sessions: number
          total_users: number
        }[]
      }
      get_attendance_for_slot_versions: {
        Args: {
          p_end_date: string
          p_section_id: string
          p_slot_id: string
          p_start_date: string
        }
        Returns: {
          attendance_date: string
          attendance_id: string
          marked_at: string
          marked_by: string
          status: string
          student_id: string
          timetable_slot_id: string
          version_number: number
        }[]
      }
      get_attendance_markers: {
        Args: { attendance_record_id: string }
        Returns: {
          assigned_faculty_email: string
          assigned_faculty_name: string
          course_name: string
          marker_email: string
          marker_id: string
          marker_name: string
          marker_role: string
          period_id: string
          period_name: string
        }[]
      }
      get_attendance_staff_conflicts: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_institution_id: string
          p_limit?: number
        }
        Returns: {
          assigned_staff: Json
          attendance_date: string
          attendance_id: string
          conflict_reason: string
          conflict_type: string
          course_name: string
          detected_at: string
          id: string
          marked_by: string
          marked_by_name: string
          period_name: string
          section_name: string
          timetable_id: string
        }[]
      }
      get_auth_uid: { Args: never; Returns: string }
      get_available_time_slots: {
        Args: {
          p_date: string
          p_resource_id: string
          p_slot_duration?: unknown
        }
        Returns: {
          end_time: string
          is_available: boolean
          start_time: string
        }[]
      }
      get_bug_leaderboard: {
        Args: never
        Returns: {
          avatar_url: string
          resolved_bugs_count: number
          total_bugs_count: number
          user_id: string
          user_name: string
        }[]
      }
      get_correct_faculty_by_course: {
        Args: {
          p_attendance_date: string
          p_course_name: string
          p_period_name: string
          p_timetable_id: string
        }
        Returns: Json
      }
      get_courses_by_department_count: {
        Args: { inst_ids?: string[] }
        Returns: {
          count: number
          name: string
        }[]
      }
      get_current_user_institution_id: { Args: never; Returns: string }
      get_current_user_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          institution_id: string | null
          is_active: boolean
          is_pre_registered: boolean | null
          is_super_admin: boolean | null
          last_login: string | null
          learner_id: string | null
          phone_number: string | null
          profile_completed: boolean
          role: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_current_user_role: { Args: never; Returns: string }
      get_day_schedule: {
        Args: { day_name: string; timetable_uuid: string }
        Returns: Json
      }
      get_faculty_attendance_reports: {
        Args: {
          faculty_staff_id: string
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_institution_id?: string
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
          page_limit?: number
          page_offset?: number
        }
        Returns: {
          academic_year_id: string
          attendance_data: Json
          attendance_date: string
          created_at: string
          degree_id: string
          department_id: string
          id: string
          institution_id: string
          program_id: string
          section_id: string
          semester_id: string
          timetable_id: string
          total_count: number
          updated_at: string
        }[]
      }
      get_faculty_attendance_stats: {
        Args: {
          p_degree_id?: string
          p_department_id?: string
          p_end_date: string
          p_institution_id: string
          p_program_id?: string
          p_section_text?: string
          p_semester_text?: string
          p_start_date: string
        }
        Returns: {
          attendance_not_taken: number
          attendance_percentage: number
          attendance_taken: number
          staff_designation: string
          staff_id: string
          staff_name: string
          total_periods: number
        }[]
      }
      get_institution_courses: {
        Args: { p_institution_id: string; p_search_term?: string }
        Returns: {
          course_code: string
          course_name: string
          id: string
        }[]
      }
      get_learners_count_by_status: {
        Args: {
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_gender?: string
          filter_institution_ids?: string[]
          filter_is_profile_complete?: boolean
          filter_lifecycle_statuses?: string[]
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
        }
        Returns: {
          count: number
          percentage: number
          status: string
        }[]
      }
      get_learners_dashboard_stats_complete: {
        Args: {
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_gender?: string
          filter_institution_ids?: string[]
          filter_is_profile_complete?: boolean
          filter_lifecycle_statuses?: string[]
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
        }
        Returns: Json
      }
      get_learners_distribution_by_department: {
        Args: {
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_gender?: string
          filter_institution_ids?: string[]
          filter_is_profile_complete?: boolean
          filter_lifecycle_statuses?: string[]
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
        }
        Returns: {
          count: number
          id: string
          name: string
          percentage: number
        }[]
      }
      get_learners_distribution_by_gender: {
        Args: {
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_gender?: string
          filter_institution_ids?: string[]
          filter_is_profile_complete?: boolean
          filter_lifecycle_statuses?: string[]
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
        }
        Returns: {
          count: number
          id: string
          name: string
          percentage: number
        }[]
      }
      get_learners_distribution_by_institution: {
        Args: {
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_gender?: string
          filter_institution_ids?: string[]
          filter_is_profile_complete?: boolean
          filter_lifecycle_statuses?: string[]
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
        }
        Returns: {
          count: number
          id: string
          name: string
          percentage: number
        }[]
      }
      get_learners_distribution_by_program: {
        Args: {
          filter_academic_year_id?: string
          filter_date_from?: string
          filter_date_to?: string
          filter_degree_id?: string
          filter_department_id?: string
          filter_gender?: string
          filter_institution_ids?: string[]
          filter_is_profile_complete?: boolean
          filter_lifecycle_statuses?: string[]
          filter_program_id?: string
          filter_section_id?: string
          filter_semester_id?: string
        }
        Returns: {
          count: number
          id: string
          name: string
          percentage: number
        }[]
      }
      get_learners_missing_profiles: {
        Args: never
        Returns: {
          college_email: string
          first_name: string
          last_name: string
          learner_id: string
        }[]
      }
      get_leaves_for_month: {
        Args: {
          p_department_id?: string
          p_institution_id: string
          p_month: number
          p_section_id?: string
          p_semester_id?: string
          p_year: number
        }
        Returns: {
          color_code: string
          end_date: string
          leave_id: string
          leave_name: string
          leave_type_name: string
          scope_level: string
          start_date: string
          status: string
        }[]
      }
      get_lti_launch_stats: {
        Args: {
          p_end_date: string
          p_institution_id: string
          p_start_date: string
        }
        Returns: {
          faculty_launches: number
          student_launches: number
          tool_name: string
          total_launches: number
          unique_users: number
        }[]
      }
      get_lti_roster: {
        Args: {
          p_institution_id: string
          p_program_id: string
          p_section_id: string
          p_semester_id: string
        }
        Returns: {
          email: string
          full_name: string
          learner_profile_id: string
          role: string
          status: string
          user_id: string
        }[]
      }
      get_my_claim: { Args: { claim: string }; Returns: Json }
      get_my_department_id: { Args: never; Returns: string }
      get_my_institution_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_period_course_id: {
        Args: { p_period_id: string; p_timetable_id: string }
        Returns: string
      }
      get_period_staff_info: {
        Args: { p_period_id: string; p_timetable_id: string }
        Returns: Json
      }
      get_periods_in_range: {
        Args: { p_end_time: string; p_start_time: string }
        Returns: {
          created_at: string | null
          end_time: string
          id: string
          institution_id: string | null
          is_break: boolean | null
          period_name: string
          start_time: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "periods"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_programs_by_degree_count: {
        Args: { inst_ids?: string[] }
        Returns: {
          count: number
          name: string
        }[]
      }
      get_related_slot_ids: {
        Args: { p_slot_id: string }
        Returns: {
          slot_id: string
        }[]
      }
      get_scholarship_permissions: {
        Args: { target_role_key: string }
        Returns: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          role_name: string
        }[]
      }
      get_staff_id_by_email: { Args: { p_email: string }; Returns: string }
      get_timetable_slot: {
        Args: { day_name: string; period_uuid: string; timetable_uuid: string }
        Returns: Json
      }
      get_timetable_slots_for_day_or_date: {
        Args: {
          p_day_of_week?: string
          p_slot_date?: string
          p_timetable_id: string
        }
        Returns: {
          slot: Json
        }[]
      }
      get_unmapped_courses: {
        Args: {
          p_institution_id: string
          p_search_term: string
          p_semester_id: string
        }
        Returns: {
          course_code: string
          course_name: string
          id: string
        }[]
      }
      get_user_accessible_institutions: {
        Args: { target_user_id: string }
        Returns: {
          access_type: string
          counselling_code: string
          institution_id: string
          institution_name: string
          is_primary_institution: boolean
        }[]
      }
      get_user_app_session: {
        Args: { p_app_id: string; p_user_id: string }
        Returns: Json
      }
      get_user_merged_permissions: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_notifications: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_unread_only?: boolean
          p_user_id: string
        }
        Returns: {
          created_at: string
          id: string
          notification: Json
          notification_id: string
          read_at: string
          user_id: string
        }[]
      }
      get_user_organizational_context: {
        Args: { p_user_id: string }
        Returns: {
          department_id: string
          institution_id: string
          program_id: string
          section_id: string
          semester_id: string
          user_role: string
        }[]
      }
      get_user_roles_with_details: {
        Args: { p_user_id: string }
        Returns: {
          assigned_at: string
          assigned_by: string
          id: string
          is_primary: boolean
          permissions: Json
          role_description: string
          role_id: string
          role_key: string
          role_name: string
          user_id: string
        }[]
      }
      get_user_staff_plan_access: {
        Args: never
        Returns: {
          staff_plan_id: string
        }[]
      }
      grant_full_scholarship_access: {
        Args: { target_role_key: string }
        Returns: undefined
      }
      grant_scholarship_creator_access: {
        Args: { target_role_key: string }
        Returns: undefined
      }
      grant_scholarship_readonly_access: {
        Args: { target_role_key: string }
        Returns: undefined
      }
      grant_scholarship_reviewer_access: {
        Args: { target_role_key: string }
        Returns: undefined
      }
      grant_user_institution_access: {
        Args: {
          access_type_param?: string
          granted_by_param?: string
          target_institution_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      has_resource_permission: {
        Args: { permission_key: string; user_uuid: string }
        Returns: boolean
      }
      has_slot_versions: { Args: { p_slot_id: string }; Returns: boolean }
      increment_ai_bulk_action_count: {
        Args: { p_count?: number; p_user_id: string }
        Returns: undefined
      }
      increment_ai_query_count: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: { user_id?: string }; Returns: boolean }
      is_date_blocked_by_leave: {
        Args: {
          p_date: string
          p_department_id?: string
          p_institution_id: string
          p_section_id?: string
          p_semester_id?: string
        }
        Returns: {
          color_code: string
          is_blocked: boolean
          leave_id: string
          leave_name: string
          leave_type_name: string
        }[]
      }
      is_profile_complete: { Args: { profile_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_api_key: { Args: never; Returns: boolean }
      link_existing_profiles_to_approved_learners: {
        Args: never
        Returns: {
          email: string
          learner_id: string
          profile_id: string
          status: string
        }[]
      }
      log_ai_query: {
        Args: {
          p_error_code?: string
          p_institution_id: string
          p_ip_address?: unknown
          p_query_text: string
          p_query_type?: string
          p_response_time_ms?: number
          p_success?: boolean
          p_tools_called?: string[]
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      log_engagement_job_stats: {
        Args: never
        Returns: {
          duration: unknown
          job_name: string
          last_run: string
          return_message: string
          status: string
        }[]
      }
      manual_invoice_generation: {
        Args: { bill_uuid: string }
        Returns: string
      }
      manual_sync_attendance_faculty: {
        Args: {
          p_from_date?: string
          p_timetable_id?: string
          p_to_date?: string
        }
        Returns: {
          message: string
          synced_count: number
          updated_count: number
        }[]
      }
      mark_overdue_bills: { Args: never; Returns: number }
      populate_attendance_hierarchy: { Args: never; Returns: number }
      preview_bill_deletion: {
        Args: { bill_id_param: string }
        Returns: {
          affected_table: string
          record_count: number
          sample_records: Json
        }[]
      }
      preview_faculty_assignment_updates: {
        Args: never
        Returns: {
          attendance_date: string
          change_type: string
          course_name: string
          new_faculty: string
          old_faculty: string
          period_name: string
          section_name: string
        }[]
      }
      recalculate_bill_status_with_refunds: {
        Args: { p_bill_id: string }
        Returns: undefined
      }
      refresh_activity_stats: { Args: never; Returns: undefined }
      refresh_student_billing_summary: {
        Args: { p_student_id: string }
        Returns: undefined
      }
      reset_receipt_number_sequence_for_year: {
        Args: never
        Returns: undefined
      }
      revoke_scholarship_access: {
        Args: { target_role_key: string }
        Returns: undefined
      }
      revoke_user_institution_access: {
        Args: { target_institution_id: string; target_user_id: string }
        Returns: undefined
      }
      safe_uuid_cast: { Args: { input_text: string }; Returns: string }
      sync_attendance_with_timetable: {
        Args: {
          p_attendance_date: string
          p_day_of_week?: string
          p_timetable_id: string
        }
        Returns: {
          action: string
          attendance_id: string
          course_name: string
          new_period_id: string
          old_period_id: string
          status: string
        }[]
      }
      sync_timetable_staff_assignment: {
        Args: {
          p_course_id: string
          p_new_staff_id: string
          p_old_staff_id: string
          p_timetable_id: string
        }
        Returns: boolean
      }
      sync_user_role_enum: { Args: never; Returns: undefined }
      update_analytics_with_activity: {
        Args: {
          p_action: string
          p_app_id: string
          p_date: string
          p_hour: number
          p_log_entry: Json
          p_status: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_attendance_faculty_assignments: {
        Args: never
        Returns: {
          attendance_date: string
          attendance_id: string
          course_name: string
          new_faculty: string
          old_faculty: string
          period_id: string
          period_name: string
          update_status: string
        }[]
      }
      update_daily_analytics: {
        Args: { p_app_id: string; p_date: string; p_stats: Json }
        Returns: undefined
      }
      update_existing_user_for_staff: {
        Args: {
          p_email: string
          p_full_name: string
          p_institution_id: string
          p_phone: string
        }
        Returns: Json
      }
      update_scholarship_permissions: {
        Args: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          target_role_key: string
        }
        Returns: undefined
      }
      update_timetable_slot: {
        Args: {
          p_day_of_week: string
          p_is_batch?: boolean
          p_period_id: string
          p_slot_data: Json
          p_timetable_id: string
        }
        Returns: Json
      }
      update_timetable_slots_batch: {
        Args: {
          p_dates: string[]
          p_period_id: string
          p_slot_data: Json
          p_timetable_id: string
        }
        Returns: Json
      }
      update_user_role: {
        Args: { new_role: string; user_id: string }
        Returns: undefined
      }
      upsert_user_app_session: {
        Args: { p_app_id: string; p_session_data: Json; p_user_id: string }
        Returns: Json
      }
      user_can_view_organizations: { Args: never; Returns: boolean }
      user_has_application_access: {
        Args: { app_id: string }
        Returns: boolean
      }
      user_has_institution_access: {
        Args: { institution_id: string; user_id: string }
        Returns: boolean
      }
      user_has_permission:
        | { Args: { permission_name: string }; Returns: boolean }
        | {
            Args: { permission_key: string; user_id: string }
            Returns: boolean
          }
      validate_and_use_auth_code: {
        Args: { p_app_id: string; p_code: string }
        Returns: Json
      }
      validate_api_key: {
        Args: { p_api_key: string; p_ip_address: string; p_origin?: string }
        Returns: {
          is_valid: boolean
          key_id: string
          permissions: Json
          rate_limit_remaining: number
        }[]
      }
      validate_attendance_period_ids: {
        Args: { p_attendance_date: string; p_timetable_id: string }
        Returns: {
          attendance_date: string
          attendance_id: string
          correct_period_id: string
          course_name: string
          faculty_name: string
          invalid_period_id: string
          needs_update: boolean
        }[]
      }
      validate_attendance_record: {
        Args: { p_attendance_id: string }
        Returns: {
          conflicts: Json
          is_valid: boolean
          suggestions: string[]
        }[]
      }
    }
    Enums: {
      api_key_status: "active" | "inactive" | "expired"
      app_type: "internal" | "external"
      application_type: "Internal" | "External"
      approval_status: "pending" | "approved" | "rejected" | "escalated"
      attribute_type:
        | "text"
        | "number"
        | "date"
        | "boolean"
        | "dropdown"
        | "textarea"
        | "email"
        | "url"
      auth_method: "sso" | "separate_login" | "none"
      authentication_method: "SSO" | "Separate Login" | "No Authentication"
      category_status: "active" | "inactive" | "archived"
      day_of_week:
        | "MONDAY"
        | "TUESDAY"
        | "WEDNESDAY"
        | "THURSDAY"
        | "FRIDAY"
        | "SATURDAY"
        | "SUNDAY"
      department: "engineering" | "science" | "arts" | "medical"
      department_status: "active" | "inactive" | "archived"
      integration_type: "direct_link" | "embedded" | "api"
      lifecycle_status:
        | "enquiry"
        | "pending"
        | "approved"
        | "rejected"
        | "waitlisted"
        | "active"
        | "inactive"
        | "exited"
        | "graduated"
        | "alumni"
      platform_type: "web" | "mobile" | "both"
      report_format: "pdf" | "excel" | "csv"
      report_status: "pending" | "processing" | "completed" | "failed"
      reservation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "completed"
        | "no_show"
      resource_status:
        | "available"
        | "occupied"
        | "maintenance"
        | "out_of_order"
        | "retired"
      sensitivity_level: "public" | "restricted" | "confidential"
      student_status: "active" | "inactive" | "exited" | "graduated" | "pending"
      supported_platform: "Web" | "Mobile" | "Both"
      user_role:
        | "super_admin"
        | "administrator"
        | "faculty"
        | "student"
        | "test"
        | "accounts"
        | "guest"
        | "staff"
        | "driver"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      api_key_status: ["active", "inactive", "expired"],
      app_type: ["internal", "external"],
      application_type: ["Internal", "External"],
      approval_status: ["pending", "approved", "rejected", "escalated"],
      attribute_type: [
        "text",
        "number",
        "date",
        "boolean",
        "dropdown",
        "textarea",
        "email",
        "url",
      ],
      auth_method: ["sso", "separate_login", "none"],
      authentication_method: ["SSO", "Separate Login", "No Authentication"],
      category_status: ["active", "inactive", "archived"],
      day_of_week: [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
      ],
      department: ["engineering", "science", "arts", "medical"],
      department_status: ["active", "inactive", "archived"],
      integration_type: ["direct_link", "embedded", "api"],
      lifecycle_status: [
        "enquiry",
        "pending",
        "approved",
        "rejected",
        "waitlisted",
        "active",
        "inactive",
        "exited",
        "graduated",
        "alumni",
      ],
      platform_type: ["web", "mobile", "both"],
      report_format: ["pdf", "excel", "csv"],
      report_status: ["pending", "processing", "completed", "failed"],
      reservation_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "completed",
        "no_show",
      ],
      resource_status: [
        "available",
        "occupied",
        "maintenance",
        "out_of_order",
        "retired",
      ],
      sensitivity_level: ["public", "restricted", "confidential"],
      student_status: ["active", "inactive", "exited", "graduated", "pending"],
      supported_platform: ["Web", "Mobile", "Both"],
      user_role: [
        "super_admin",
        "administrator",
        "faculty",
        "student",
        "test",
        "accounts",
        "guest",
        "staff",
        "driver",
      ],
    },
  },
} as const
