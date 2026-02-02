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
    PostgrestVersion: "14.1"
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
      admission_applications: {
        Row: {
          academic_year: string
          application_number: string | null
          campus_id: string | null
          can_reapply: boolean | null
          completion_percentage: number | null
          created_at: string | null
          current_step: number | null
          expires_at: string | null
          form_data: Json | null
          id: string
          institution_id: string
          last_saved_at: string | null
          lead_id: string
          learner_profile_id: string | null
          program_id: string
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["application_status"] | null
          status_changed_at: string | null
          status_history: Json | null
          steps_completed: Json | null
          submitted_at: string | null
          total_steps: number | null
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          application_number?: string | null
          campus_id?: string | null
          can_reapply?: boolean | null
          completion_percentage?: number | null
          created_at?: string | null
          current_step?: number | null
          expires_at?: string | null
          form_data?: Json | null
          id?: string
          institution_id: string
          last_saved_at?: string | null
          lead_id: string
          learner_profile_id?: string | null
          program_id: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["application_status"] | null
          status_changed_at?: string | null
          status_history?: Json | null
          steps_completed?: Json | null
          submitted_at?: string | null
          total_steps?: number | null
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          application_number?: string | null
          campus_id?: string | null
          can_reapply?: boolean | null
          completion_percentage?: number | null
          created_at?: string | null
          current_step?: number | null
          expires_at?: string | null
          form_data?: Json | null
          id?: string
          institution_id?: string
          last_saved_at?: string | null
          lead_id?: string
          learner_profile_id?: string | null
          program_id?: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["application_status"] | null
          status_changed_at?: string | null
          status_history?: Json | null
          steps_completed?: Json | null
          submitted_at?: string | null
          total_steps?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "admission_applications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "admission_applications_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "admission_applications_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
          },
          {
            foreignKeyName: "admission_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_leads: {
        Row: {
          assigned_at: string | null
          assigned_counselor_id: string | null
          combined_score: number | null
          conversion_probability: number | null
          created_at: string | null
          created_by: string | null
          dormant_at: string | null
          engagement_score: number | null
          id: string
          institution_id: string
          interested_programs: string[] | null
          is_active: boolean | null
          is_dormant: boolean | null
          is_hot_lead: boolean | null
          is_lost: boolean | null
          is_priority: boolean | null
          last_activity_at: string | null
          last_contact_at: string | null
          last_message_at: string | null
          learner_profile_id: string
          lost_at: string | null
          lost_reason: string | null
          messages_this_week: number | null
          ownership_mode:
            | Database["public"]["Enums"]["lead_ownership_mode"]
            | null
          parent_email: string | null
          parent_name: string | null
          parent_opted_in: boolean | null
          parent_phone: string | null
          preferred_campus: string | null
          preferred_channel:
            | Database["public"]["Enums"]["communication_channel_type"]
            | null
          previous_stage:
            | Database["public"]["Enums"]["admission_lead_stage"]
            | null
          quality_score: number | null
          score_breakdown: Json | null
          stage: Database["public"]["Enums"]["admission_lead_stage"] | null
          stage_changed_at: string | null
          tags: string[] | null
          total_messages_sent: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_counselor_id?: string | null
          combined_score?: number | null
          conversion_probability?: number | null
          created_at?: string | null
          created_by?: string | null
          dormant_at?: string | null
          engagement_score?: number | null
          id?: string
          institution_id: string
          interested_programs?: string[] | null
          is_active?: boolean | null
          is_dormant?: boolean | null
          is_hot_lead?: boolean | null
          is_lost?: boolean | null
          is_priority?: boolean | null
          last_activity_at?: string | null
          last_contact_at?: string | null
          last_message_at?: string | null
          learner_profile_id: string
          lost_at?: string | null
          lost_reason?: string | null
          messages_this_week?: number | null
          ownership_mode?:
            | Database["public"]["Enums"]["lead_ownership_mode"]
            | null
          parent_email?: string | null
          parent_name?: string | null
          parent_opted_in?: boolean | null
          parent_phone?: string | null
          preferred_campus?: string | null
          preferred_channel?:
            | Database["public"]["Enums"]["communication_channel_type"]
            | null
          previous_stage?:
            | Database["public"]["Enums"]["admission_lead_stage"]
            | null
          quality_score?: number | null
          score_breakdown?: Json | null
          stage?: Database["public"]["Enums"]["admission_lead_stage"] | null
          stage_changed_at?: string | null
          tags?: string[] | null
          total_messages_sent?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_counselor_id?: string | null
          combined_score?: number | null
          conversion_probability?: number | null
          created_at?: string | null
          created_by?: string | null
          dormant_at?: string | null
          engagement_score?: number | null
          id?: string
          institution_id?: string
          interested_programs?: string[] | null
          is_active?: boolean | null
          is_dormant?: boolean | null
          is_hot_lead?: boolean | null
          is_lost?: boolean | null
          is_priority?: boolean | null
          last_activity_at?: string | null
          last_contact_at?: string | null
          last_message_at?: string | null
          learner_profile_id?: string
          lost_at?: string | null
          lost_reason?: string | null
          messages_this_week?: number | null
          ownership_mode?:
            | Database["public"]["Enums"]["lead_ownership_mode"]
            | null
          parent_email?: string | null
          parent_name?: string | null
          parent_opted_in?: boolean | null
          parent_phone?: string | null
          preferred_campus?: string | null
          preferred_channel?:
            | Database["public"]["Enums"]["communication_channel_type"]
            | null
          previous_stage?:
            | Database["public"]["Enums"]["admission_lead_stage"]
            | null
          quality_score?: number | null
          score_breakdown?: Json | null
          stage?: Database["public"]["Enums"]["admission_lead_stage"] | null
          stage_changed_at?: string | null
          tags?: string[] | null
          total_messages_sent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_assigned_counselor_id_fkey"
            columns: ["assigned_counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_leads_assigned_counselor_id_fkey"
            columns: ["assigned_counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "admission_leads_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: true
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: true
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "admission_leads_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: true
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
          },
        ]
      }
      admission_payments: {
        Row: {
          amount: number
          application_id: string
          created_at: string | null
          currency: string | null
          discount_amount: number | null
          discount_reason: string | null
          due_date: string | null
          fee_breakdown: Json | null
          gateway_name: string | null
          gateway_order_id: string | null
          gateway_payment_id: string | null
          gateway_signature: string | null
          id: string
          institution_id: string
          last_reminder_at: string | null
          paid_at: string | null
          payment_method: string | null
          payment_type: Database["public"]["Enums"]["admission_payment_type"]
          receipt_number: string | null
          receipt_url: string | null
          refund_amount: number | null
          refund_reason: string | null
          refund_reference: string | null
          refunded_at: string | null
          reminder_count: number | null
          scholarship_id: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          application_id: string
          created_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          due_date?: string | null
          fee_breakdown?: Json | null
          gateway_name?: string | null
          gateway_order_id?: string | null
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          institution_id: string
          last_reminder_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type: Database["public"]["Enums"]["admission_payment_type"]
          receipt_number?: string | null
          receipt_url?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refund_reference?: string | null
          refunded_at?: string | null
          reminder_count?: number | null
          scholarship_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          application_id?: string
          created_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          due_date?: string | null
          fee_breakdown?: Json | null
          gateway_name?: string | null
          gateway_order_id?: string | null
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          institution_id?: string
          last_reminder_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: Database["public"]["Enums"]["admission_payment_type"]
          receipt_number?: string | null
          receipt_url?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refund_reference?: string | null
          refunded_at?: string | null
          reminder_count?: number | null
          scholarship_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_payments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_payments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      admission_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          created_by_system: boolean | null
          description: string | null
          due_at: string
          id: string
          institution_id: string
          lead_id: string
          outcome: string | null
          outcome_notes: string | null
          priority: number | null
          reminder_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_system?: boolean | null
          description?: string | null
          due_at: string
          id?: string
          institution_id: string
          lead_id: string
          outcome?: string | null
          outcome_notes?: string | null
          priority?: number | null
          reminder_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_system?: boolean | null
          description?: string | null
          due_at?: string
          id?: string
          institution_id?: string
          lead_id?: string
          outcome?: string | null
          outcome_notes?: string | null
          priority?: number | null
          reminder_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_tasks_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_tasks_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "admission_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      admissions: {
        Row: {
          academic_year: string | null
          admission_date: string | null
          admission_number: string | null
          admission_type: string | null
          created_at: string
          documents: Json | null
          fee_structure: Json | null
          id: string
          institution_id: string | null
          notes: string | null
          program_id: string | null
          status: string | null
          student_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          admission_date?: string | null
          admission_number?: string | null
          admission_type?: string | null
          created_at?: string
          documents?: Json | null
          fee_structure?: Json | null
          id?: string
          institution_id?: string | null
          notes?: string | null
          program_id?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          admission_date?: string | null
          admission_number?: string | null
          admission_type?: string | null
          created_at?: string
          documents?: Json | null
          fee_structure?: Json | null
          id?: string
          institution_id?: string | null
          notes?: string | null
          program_id?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admissions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "admissions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
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
      application_documents: {
        Row: {
          application_id: string
          document_type_id: string
          extracted_data: Json | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          rejection_reason: string | null
          reupload_notes: string | null
          updated_at: string | null
          uploaded_at: string | null
          verification_status:
            | Database["public"]["Enums"]["document_verification_status"]
            | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          application_id: string
          document_type_id: string
          extracted_data?: Json | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          reupload_notes?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["document_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          application_id?: string
          document_type_id?: string
          extracted_data?: Json | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          reupload_notes?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["document_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "application_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      billing_copq_incidents: {
        Row: {
          affected_stakeholders: number | null
          bill_id: string | null
          category: string
          created_at: string | null
          description: string
          hidden_cost_estimate: number | null
          id: string
          incident_date: string
          institution_id: string
          learner_id: string | null
          preventive_action: string | null
          reported_by: string | null
          resolved_at: string | null
          root_cause: string | null
          status: string | null
          time_spent_hours: number | null
          updated_at: string | null
          visible_cost: number | null
        }
        Insert: {
          affected_stakeholders?: number | null
          bill_id?: string | null
          category: string
          created_at?: string | null
          description: string
          hidden_cost_estimate?: number | null
          id?: string
          incident_date?: string
          institution_id: string
          learner_id?: string | null
          preventive_action?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          status?: string | null
          time_spent_hours?: number | null
          updated_at?: string | null
          visible_cost?: number | null
        }
        Update: {
          affected_stakeholders?: number | null
          bill_id?: string | null
          category?: string
          created_at?: string | null
          description?: string
          hidden_cost_estimate?: number | null
          id?: string
          incident_date?: string
          institution_id?: string
          learner_id?: string | null
          preventive_action?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          status?: string | null
          time_spent_hours?: number | null
          updated_at?: string | null
          visible_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_copq_incidents_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_deletion_dependencies"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "billing_student_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "fk_billing_invoices_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
          {
            foreignKeyName: "fk_billing_receipts_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
          {
            foreignKeyName: "fk_billing_student_bills_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
            foreignKeyName: "bug_reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      communication_channels: {
        Row: {
          channel_type: Database["public"]["Enums"]["communication_channel_type"]
          config: Json
          created_at: string | null
          health_status: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          is_primary: boolean | null
          last_health_check_at: string | null
          provider_name: string
          rate_limit_per_day: number | null
          rate_limit_per_minute: number | null
          rate_limit_per_second: number | null
          updated_at: string | null
        }
        Insert: {
          channel_type: Database["public"]["Enums"]["communication_channel_type"]
          config?: Json
          created_at?: string | null
          health_status?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          last_health_check_at?: string | null
          provider_name: string
          rate_limit_per_day?: number | null
          rate_limit_per_minute?: number | null
          rate_limit_per_second?: number | null
          updated_at?: string | null
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["communication_channel_type"]
          config?: Json
          created_at?: string | null
          health_status?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          last_health_check_at?: string | null
          provider_name?: string
          rate_limit_per_day?: number | null
          rate_limit_per_minute?: number | null
          rate_limit_per_second?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_channels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_channels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      communication_log: {
        Row: {
          channel: Database["public"]["Enums"]["communication_channel_type"]
          content: string
          created_at: string | null
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          external_id: string | null
          failed_at: string | null
          id: string
          institution_id: string
          is_automated: boolean | null
          lead_id: string
          metadata: Json | null
          provider_name: string | null
          queued_at: string | null
          read_at: string | null
          recipient: string
          replied_at: string | null
          retry_count: number | null
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["message_status"] | null
          subject: string | null
          template_id: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["communication_channel_type"]
          content: string
          created_at?: string | null
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string
          institution_id: string
          is_automated?: boolean | null
          lead_id: string
          metadata?: Json | null
          provider_name?: string | null
          queued_at?: string | null
          read_at?: string | null
          recipient: string
          replied_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["message_status"] | null
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["communication_channel_type"]
          content?: string
          created_at?: string | null
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string
          institution_id?: string
          is_automated?: boolean | null
          lead_id?: string
          metadata?: Json | null
          provider_name?: string | null
          queued_at?: string | null
          read_at?: string | null
          recipient?: string
          replied_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["message_status"] | null
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "communication_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "communication_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "communication_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_commission_structures: {
        Row: {
          applies_to_all_programs: boolean | null
          base_amount: number | null
          base_rate: number | null
          clawback_conditions: Json | null
          clawback_enabled: boolean | null
          clawback_percentage: number | null
          clawback_period_days: number | null
          commission_basis: string | null
          commission_type: string
          consultant_id: string
          created_at: string | null
          created_by: string | null
          degree_id: string | null
          department_id: string | null
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          milestones: Json
          name: string
          priority: number | null
          program_id: string | null
          updated_at: string | null
          updated_by: string | null
          volume_tiers: Json | null
          volume_tiers_enabled: boolean | null
        }
        Insert: {
          applies_to_all_programs?: boolean | null
          base_amount?: number | null
          base_rate?: number | null
          clawback_conditions?: Json | null
          clawback_enabled?: boolean | null
          clawback_percentage?: number | null
          clawback_period_days?: number | null
          commission_basis?: string | null
          commission_type?: string
          consultant_id: string
          created_at?: string | null
          created_by?: string | null
          degree_id?: string | null
          department_id?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          milestones?: Json
          name: string
          priority?: number | null
          program_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          volume_tiers?: Json | null
          volume_tiers_enabled?: boolean | null
        }
        Update: {
          applies_to_all_programs?: boolean | null
          base_amount?: number | null
          base_rate?: number | null
          clawback_conditions?: Json | null
          clawback_enabled?: boolean | null
          clawback_percentage?: number | null
          clawback_period_days?: number | null
          commission_basis?: string | null
          commission_type?: string
          consultant_id?: string
          created_at?: string | null
          created_by?: string | null
          degree_id?: string | null
          department_id?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          milestones?: Json
          name?: string
          priority?: number | null
          program_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          volume_tiers?: Json | null
          volume_tiers_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_commission_structures_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_commission_structures_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_commission_transactions: {
        Row: {
          admission_id: string | null
          approved_at: string | null
          approved_by: string | null
          attribution_id: string | null
          clawback_reason: string | null
          commission_basis_amount: number | null
          commission_rate: number | null
          consultant_id: string
          created_at: string | null
          created_by: string | null
          gross_amount: number
          id: string
          institution_id: string
          learner_profile_id: string | null
          milestone_description: string | null
          milestone_stage: string | null
          net_amount: number
          notes: string | null
          original_transaction_id: string | null
          other_deductions: number | null
          payment_date: string | null
          payment_mode: string | null
          payment_reference: string | null
          payout_batch_id: string | null
          rejection_reason: string | null
          status: string | null
          status_history: Json | null
          tds_amount: number | null
          tds_percentage: number | null
          transaction_number: string | null
          transaction_type: string
          updated_at: string | null
          volume_tier_multiplier: number | null
        }
        Insert: {
          admission_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attribution_id?: string | null
          clawback_reason?: string | null
          commission_basis_amount?: number | null
          commission_rate?: number | null
          consultant_id: string
          created_at?: string | null
          created_by?: string | null
          gross_amount: number
          id?: string
          institution_id: string
          learner_profile_id?: string | null
          milestone_description?: string | null
          milestone_stage?: string | null
          net_amount: number
          notes?: string | null
          original_transaction_id?: string | null
          other_deductions?: number | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payout_batch_id?: string | null
          rejection_reason?: string | null
          status?: string | null
          status_history?: Json | null
          tds_amount?: number | null
          tds_percentage?: number | null
          transaction_number?: string | null
          transaction_type: string
          updated_at?: string | null
          volume_tier_multiplier?: number | null
        }
        Update: {
          admission_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attribution_id?: string | null
          clawback_reason?: string | null
          commission_basis_amount?: number | null
          commission_rate?: number | null
          consultant_id?: string
          created_at?: string | null
          created_by?: string | null
          gross_amount?: number
          id?: string
          institution_id?: string
          learner_profile_id?: string | null
          milestone_description?: string | null
          milestone_stage?: string | null
          net_amount?: number
          notes?: string | null
          original_transaction_id?: string | null
          other_deductions?: number | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payout_batch_id?: string | null
          rejection_reason?: string | null
          status?: string | null
          status_history?: Json | null
          tds_amount?: number | null
          tds_percentage?: number | null
          transaction_number?: string | null
          transaction_type?: string
          updated_at?: string | null
          volume_tier_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_commission_transactions_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "consultant_lead_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_commission_transactions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_commission_transactions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_communications: {
        Row: {
          attachments: Json | null
          call_duration_seconds: number | null
          call_outcome: string | null
          call_recording_url: string | null
          communication_type: string
          consultant_id: string
          content: string | null
          content_html: string | null
          created_at: string | null
          created_by: string | null
          direction: string | null
          email_message_id: string | null
          email_thread_id: string | null
          follow_up_completed: boolean | null
          follow_up_completed_at: string | null
          follow_up_date: string | null
          follow_up_notes: string | null
          follow_up_required: boolean | null
          follow_up_type: string | null
          id: string
          institution_id: string
          linked_lead_id: string | null
          linked_transaction_id: string | null
          meeting_attendees: Json | null
          meeting_date: string | null
          meeting_end_date: string | null
          meeting_location: string | null
          meeting_outcome: string | null
          meeting_type: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          call_duration_seconds?: number | null
          call_outcome?: string | null
          call_recording_url?: string | null
          communication_type: string
          consultant_id: string
          content?: string | null
          content_html?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string | null
          email_message_id?: string | null
          email_thread_id?: string | null
          follow_up_completed?: boolean | null
          follow_up_completed_at?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          follow_up_type?: string | null
          id?: string
          institution_id: string
          linked_lead_id?: string | null
          linked_transaction_id?: string | null
          meeting_attendees?: Json | null
          meeting_date?: string | null
          meeting_end_date?: string | null
          meeting_location?: string | null
          meeting_outcome?: string | null
          meeting_type?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          call_duration_seconds?: number | null
          call_outcome?: string | null
          call_recording_url?: string | null
          communication_type?: string
          consultant_id?: string
          content?: string | null
          content_html?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string | null
          email_message_id?: string | null
          email_thread_id?: string | null
          follow_up_completed?: boolean | null
          follow_up_completed_at?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          follow_up_type?: string | null
          id?: string
          institution_id?: string
          linked_lead_id?: string | null
          linked_transaction_id?: string | null
          meeting_attendees?: Json | null
          meeting_date?: string | null
          meeting_end_date?: string | null
          meeting_location?: string | null
          meeting_outcome?: string | null
          meeting_type?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_communications_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_communications_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_documents: {
        Row: {
          consultant_id: string
          created_at: string | null
          document_description: string | null
          document_name: string
          document_type: string
          document_url: string
          expiry_notification_days: number | null
          expiry_notification_sent: boolean | null
          file_size_bytes: number | null
          id: string
          institution_id: string
          is_mandatory: boolean | null
          is_verified: boolean | null
          mime_type: string | null
          previous_version_id: string | null
          requires_verification: boolean | null
          status: string | null
          updated_at: string | null
          uploaded_by: string | null
          valid_from: string | null
          valid_to: string | null
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
          version: number | null
        }
        Insert: {
          consultant_id: string
          created_at?: string | null
          document_description?: string | null
          document_name: string
          document_type: string
          document_url: string
          expiry_notification_days?: number | null
          expiry_notification_sent?: boolean | null
          file_size_bytes?: number | null
          id?: string
          institution_id: string
          is_mandatory?: boolean | null
          is_verified?: boolean | null
          mime_type?: string | null
          previous_version_id?: string | null
          requires_verification?: boolean | null
          status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Update: {
          consultant_id?: string
          created_at?: string | null
          document_description?: string | null
          document_name?: string
          document_type?: string
          document_url?: string
          expiry_notification_days?: number | null
          expiry_notification_sent?: boolean | null
          file_size_bytes?: number | null
          id?: string
          institution_id?: string
          is_mandatory?: boolean | null
          is_verified?: boolean | null
          mime_type?: string | null
          previous_version_id?: string | null
          requires_verification?: boolean | null
          status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_documents_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_documents_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_lead_attributions: {
        Row: {
          admission_id: string | null
          attribution_percentage: number
          attribution_type: string | null
          commission_structure_id: string | null
          consultant_id: string
          created_at: string | null
          current_stage: string | null
          dispute_reason: string | null
          dispute_resolved_at: string | null
          id: string
          institution_id: string
          is_disputed: boolean | null
          is_verified: boolean | null
          learner_profile_id: string | null
          notes: string | null
          referral_code: string | null
          referral_source: string | null
          referral_url: string | null
          stage_history: Json | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          admission_id?: string | null
          attribution_percentage?: number
          attribution_type?: string | null
          commission_structure_id?: string | null
          consultant_id: string
          created_at?: string | null
          current_stage?: string | null
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          id?: string
          institution_id: string
          is_disputed?: boolean | null
          is_verified?: boolean | null
          learner_profile_id?: string | null
          notes?: string | null
          referral_code?: string | null
          referral_source?: string | null
          referral_url?: string | null
          stage_history?: Json | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          admission_id?: string | null
          attribution_percentage?: number
          attribution_type?: string | null
          commission_structure_id?: string | null
          consultant_id?: string
          created_at?: string | null
          current_stage?: string | null
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          id?: string
          institution_id?: string
          is_disputed?: boolean | null
          is_verified?: boolean | null
          learner_profile_id?: string | null
          notes?: string | null
          referral_code?: string | null
          referral_source?: string | null
          referral_url?: string | null
          stage_history?: Json | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_lead_attributions_commission_structure_id_fkey"
            columns: ["commission_structure_id"]
            isOneToOne: false
            referencedRelation: "consultant_commission_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_lead_attributions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_lead_attributions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_payment_queries: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          attachments: Json | null
          consultant_id: string
          created_at: string | null
          description: string
          escalated_at: string | null
          escalated_to: string | null
          escalation_reason: string | null
          expected_resolution_date: string | null
          id: string
          institution_id: string
          is_escalated: boolean | null
          messages: Json | null
          payout_batch_id: string | null
          priority: string | null
          query_number: string | null
          query_type: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          sla_breached: boolean | null
          status: string | null
          subject: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          consultant_id: string
          created_at?: string | null
          description: string
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          expected_resolution_date?: string | null
          id?: string
          institution_id: string
          is_escalated?: boolean | null
          messages?: Json | null
          payout_batch_id?: string | null
          priority?: string | null
          query_number?: string | null
          query_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_breached?: boolean | null
          status?: string | null
          subject: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          consultant_id?: string
          created_at?: string | null
          description?: string
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          expected_resolution_date?: string | null
          id?: string
          institution_id?: string
          is_escalated?: boolean | null
          messages?: Json | null
          payout_batch_id?: string | null
          priority?: string | null
          query_number?: string | null
          query_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_breached?: boolean | null
          status?: string | null
          subject?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_payment_queries_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_payment_queries_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_payment_queries_payout_batch_id_fkey"
            columns: ["payout_batch_id"]
            isOneToOne: false
            referencedRelation: "consultant_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_payment_queries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "consultant_commission_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_payout_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_reference: string | null
          batch_name: string | null
          batch_number: string | null
          batch_period_end: string | null
          batch_period_start: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          institution_id: string
          notes: string | null
          payment_mode: string | null
          prepared_at: string | null
          prepared_by: string | null
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          status_history: Json | null
          total_consultants: number | null
          total_deductions: number | null
          total_gross_amount: number | null
          total_net_amount: number | null
          total_tds_amount: number | null
          total_transactions: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_reference?: string | null
          batch_name?: string | null
          batch_number?: string | null
          batch_period_end?: string | null
          batch_period_start?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          institution_id: string
          notes?: string | null
          payment_mode?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          status_history?: Json | null
          total_consultants?: number | null
          total_deductions?: number | null
          total_gross_amount?: number | null
          total_net_amount?: number | null
          total_tds_amount?: number | null
          total_transactions?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_reference?: string | null
          batch_name?: string | null
          batch_number?: string | null
          batch_period_end?: string | null
          batch_period_start?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          institution_id?: string
          notes?: string | null
          payment_mode?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          status_history?: Json | null
          total_consultants?: number | null
          total_deductions?: number | null
          total_gross_amount?: number | null
          total_net_amount?: number | null
          total_tds_amount?: number | null
          total_transactions?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      counselor_activities: {
        Row: {
          activity_data: Json | null
          activity_type: string
          counselor_id: string
          created_at: string | null
          duration_seconds: number | null
          id: string
          institution_id: string
          lead_id: string | null
          response_time_seconds: number | null
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          counselor_id: string
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          institution_id: string
          lead_id?: string | null
          response_time_seconds?: number | null
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          counselor_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          institution_id?: string
          lead_id?: string | null
          response_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_activities_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "counselor_activities_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_activities_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_activities_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "counselor_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      counselor_daily_metrics: {
        Row: {
          avg_response_time_seconds: number | null
          calls_duration_total: number | null
          calls_made: number | null
          counselor_id: string
          created_at: string | null
          emails_sent: number | null
          fastest_response_seconds: number | null
          id: string
          institution_id: string
          leads_assigned: number | null
          leads_contacted: number | null
          leads_converted: number | null
          leads_lost: number | null
          metric_date: string
          stage_progressions: number | null
          tasks_completed: number | null
          tasks_created: number | null
          updated_at: string | null
          whatsapp_sent: number | null
        }
        Insert: {
          avg_response_time_seconds?: number | null
          calls_duration_total?: number | null
          calls_made?: number | null
          counselor_id: string
          created_at?: string | null
          emails_sent?: number | null
          fastest_response_seconds?: number | null
          id?: string
          institution_id: string
          leads_assigned?: number | null
          leads_contacted?: number | null
          leads_converted?: number | null
          leads_lost?: number | null
          metric_date: string
          stage_progressions?: number | null
          tasks_completed?: number | null
          tasks_created?: number | null
          updated_at?: string | null
          whatsapp_sent?: number | null
        }
        Update: {
          avg_response_time_seconds?: number | null
          calls_duration_total?: number | null
          calls_made?: number | null
          counselor_id?: string
          created_at?: string | null
          emails_sent?: number | null
          fastest_response_seconds?: number | null
          id?: string
          institution_id?: string
          leads_assigned?: number | null
          leads_contacted?: number | null
          leads_converted?: number | null
          leads_lost?: number | null
          metric_date?: string
          stage_progressions?: number | null
          tasks_completed?: number | null
          tasks_created?: number | null
          updated_at?: string | null
          whatsapp_sent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_daily_metrics_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      counselor_metrics_daily: {
        Row: {
          avg_first_response_minutes: number | null
          avg_task_completion_hours: number | null
          call_duration_minutes: number | null
          calls_connected: number | null
          calls_made: number | null
          counselor_id: string
          created_at: string | null
          escalations_received: number | null
          escalations_resolved: number | null
          id: string
          institution_id: string
          leads_contacted: number | null
          leads_converted: number | null
          leads_lost: number | null
          leads_qualified: number | null
          leads_responded_outside_sla: number | null
          leads_responded_within_sla: number | null
          messages_replied: number | null
          messages_sent: number | null
          metric_date: string
          new_leads_assigned: number | null
          tasks_assigned: number | null
          tasks_completed: number | null
          tasks_overdue: number | null
          updated_at: string | null
        }
        Insert: {
          avg_first_response_minutes?: number | null
          avg_task_completion_hours?: number | null
          call_duration_minutes?: number | null
          calls_connected?: number | null
          calls_made?: number | null
          counselor_id: string
          created_at?: string | null
          escalations_received?: number | null
          escalations_resolved?: number | null
          id?: string
          institution_id: string
          leads_contacted?: number | null
          leads_converted?: number | null
          leads_lost?: number | null
          leads_qualified?: number | null
          leads_responded_outside_sla?: number | null
          leads_responded_within_sla?: number | null
          messages_replied?: number | null
          messages_sent?: number | null
          metric_date: string
          new_leads_assigned?: number | null
          tasks_assigned?: number | null
          tasks_completed?: number | null
          tasks_overdue?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_first_response_minutes?: number | null
          avg_task_completion_hours?: number | null
          call_duration_minutes?: number | null
          calls_connected?: number | null
          calls_made?: number | null
          counselor_id?: string
          created_at?: string | null
          escalations_received?: number | null
          escalations_resolved?: number | null
          id?: string
          institution_id?: string
          leads_contacted?: number | null
          leads_converted?: number | null
          leads_lost?: number | null
          leads_qualified?: number | null
          leads_responded_outside_sla?: number | null
          leads_responded_within_sla?: number | null
          messages_replied?: number | null
          messages_sent?: number | null
          metric_date?: string
          new_leads_assigned?: number | null
          tasks_assigned?: number | null
          tasks_completed?: number | null
          tasks_overdue?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_metrics_daily_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "counselor_metrics_daily_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_metrics_daily_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_metrics_daily_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      counselor_targets: {
        Row: {
          calls_to_make: number | null
          conversion_rate_target: number | null
          counselor_id: string | null
          created_at: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          leads_to_contact: number | null
          max_response_time_hours: number | null
          target_period: string
          tasks_to_complete: number | null
          updated_at: string | null
        }
        Insert: {
          calls_to_make?: number | null
          conversion_rate_target?: number | null
          counselor_id?: string | null
          created_at?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          leads_to_contact?: number | null
          max_response_time_hours?: number | null
          target_period: string
          tasks_to_complete?: number | null
          updated_at?: string | null
        }
        Update: {
          calls_to_make?: number | null
          conversion_rate_target?: number | null
          counselor_id?: string | null
          created_at?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          leads_to_contact?: number | null
          max_response_time_hours?: number | null
          target_period?: string
          tasks_to_complete?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_targets_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "counselor_targets_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_targets_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_targets_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
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
            foreignKeyName: "course_mappings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      distribution_rules: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          conditions: Json
          created_at: string | null
          created_by: string | null
          current_index: number | null
          description: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          max_leads_per_counselor: number | null
          name: string
          priority: number | null
          required_skills: string[] | null
          target_counselor_ids: string[] | null
          target_team_id: string | null
          updated_at: string | null
        }
        Insert: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          conditions?: Json
          created_at?: string | null
          created_by?: string | null
          current_index?: number | null
          description?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          max_leads_per_counselor?: number | null
          name: string
          priority?: number | null
          required_skills?: string[] | null
          target_counselor_ids?: string[] | null
          target_team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          conditions?: Json
          created_at?: string | null
          created_by?: string | null
          current_index?: number | null
          description?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          max_leads_per_counselor?: number | null
          name?: string
          priority?: number | null
          required_skills?: string[] | null
          target_counselor_ids?: string[] | null
          target_team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      document_types: {
        Row: {
          allowed_extensions: string[] | null
          applies_to_categories: string[] | null
          applies_to_programs: string[] | null
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          help_text: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          is_required: boolean | null
          max_file_size_mb: number | null
          name: string
        }
        Insert: {
          allowed_extensions?: string[] | null
          applies_to_categories?: string[] | null
          applies_to_programs?: string[] | null
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          help_text?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_file_size_mb?: number | null
          name: string
        }
        Update: {
          allowed_extensions?: string[] | null
          applies_to_categories?: string[] | null
          applies_to_programs?: string[] | null
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          help_text?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_file_size_mb?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_types_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      education_consultants: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          alternate_phone: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          code: string | null
          company_name: string | null
          company_registration_no: string | null
          consultant_type: string
          contact_person: string | null
          contract_document_url: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          contract_status: string | null
          contract_terms: Json | null
          conversion_rate: number | null
          country: string | null
          covered_cities: Json | null
          covered_regions: Json | null
          covered_states: Json | null
          created_at: string | null
          created_by: string | null
          email: string | null
          gst_number: string | null
          id: string
          institution_id: string
          internal_notes: string | null
          learner_profile_id: string | null
          name: string
          onboarded_at: string | null
          onboarded_by: string | null
          pan_number: string | null
          payment_preference: string | null
          pending_commission: number | null
          performance_rating: number | null
          phone: string | null
          pincode: string | null
          profile_photo_url: string | null
          referrer_user_id: string | null
          relationship_score: number | null
          specialized_degrees: string[] | null
          specialized_departments: string[] | null
          specialized_programs: string[] | null
          state: string | null
          status: string | null
          tags: Json | null
          tier: Database["public"]["Enums"]["consultant_tier"]
          total_commission_earned: number | null
          total_commission_paid: number | null
          total_conversions: number | null
          total_leads_referred: number | null
          updated_at: string | null
          updated_by: string | null
          upi_id: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          alternate_phone?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          code?: string | null
          company_name?: string | null
          company_registration_no?: string | null
          consultant_type?: string
          contact_person?: string | null
          contract_document_url?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_status?: string | null
          contract_terms?: Json | null
          conversion_rate?: number | null
          country?: string | null
          covered_cities?: Json | null
          covered_regions?: Json | null
          covered_states?: Json | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          institution_id: string
          internal_notes?: string | null
          learner_profile_id?: string | null
          name: string
          onboarded_at?: string | null
          onboarded_by?: string | null
          pan_number?: string | null
          payment_preference?: string | null
          pending_commission?: number | null
          performance_rating?: number | null
          phone?: string | null
          pincode?: string | null
          profile_photo_url?: string | null
          referrer_user_id?: string | null
          relationship_score?: number | null
          specialized_degrees?: string[] | null
          specialized_departments?: string[] | null
          specialized_programs?: string[] | null
          state?: string | null
          status?: string | null
          tags?: Json | null
          tier?: Database["public"]["Enums"]["consultant_tier"]
          total_commission_earned?: number | null
          total_commission_paid?: number | null
          total_conversions?: number | null
          total_leads_referred?: number | null
          updated_at?: string | null
          updated_by?: string | null
          upi_id?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          alternate_phone?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          code?: string | null
          company_name?: string | null
          company_registration_no?: string | null
          consultant_type?: string
          contact_person?: string | null
          contract_document_url?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_status?: string | null
          contract_terms?: Json | null
          conversion_rate?: number | null
          country?: string | null
          covered_cities?: Json | null
          covered_regions?: Json | null
          covered_states?: Json | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          institution_id?: string
          internal_notes?: string | null
          learner_profile_id?: string | null
          name?: string
          onboarded_at?: string | null
          onboarded_by?: string | null
          pan_number?: string | null
          payment_preference?: string | null
          pending_commission?: number | null
          performance_rating?: number | null
          phone?: string | null
          pincode?: string | null
          profile_photo_url?: string | null
          referrer_user_id?: string | null
          relationship_score?: number | null
          specialized_degrees?: string[] | null
          specialized_departments?: string[] | null
          specialized_programs?: string[] | null
          state?: string | null
          status?: string | null
          tags?: Json | null
          tier?: Database["public"]["Enums"]["consultant_tier"]
          total_commission_earned?: number | null
          total_commission_paid?: number | null
          total_conversions?: number | null
          total_leads_referred?: number | null
          updated_at?: string | null
          updated_by?: string | null
          upi_id?: string | null
        }
        Relationships: []
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
      escalation_log: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          escalated_from: string | null
          escalated_to: string | null
          id: string
          institution_id: string
          lead_id: string
          notes: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string
          status: Database["public"]["Enums"]["escalation_status"] | null
          trigger_data: Json | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          escalated_from?: string | null
          escalated_to?: string | null
          id?: string
          institution_id: string
          lead_id: string
          notes?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id: string
          status?: Database["public"]["Enums"]["escalation_status"] | null
          trigger_data?: Json | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          escalated_from?: string | null
          escalated_to?: string | null
          id?: string
          institution_id?: string
          lead_id?: string
          notes?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string
          status?: Database["public"]["Enums"]["escalation_status"] | null
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_log_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_log_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_from_fkey"
            columns: ["escalated_from"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_from_fkey"
            columns: ["escalated_from"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "escalation_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "escalation_log_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_log_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "escalation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_rules: {
        Row: {
          cooldown_hours: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          escalate_to: string | null
          escalate_to_role: string | null
          id: string
          include_lead_history: boolean | null
          institution_id: string
          is_active: boolean | null
          name: string
          notification_channels: string[] | null
          notification_template_id: string | null
          priority: number | null
          trigger_condition: Json
          updated_at: string | null
        }
        Insert: {
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          escalate_to?: string | null
          escalate_to_role?: string | null
          id?: string
          include_lead_history?: boolean | null
          institution_id: string
          is_active?: boolean | null
          name: string
          notification_channels?: string[] | null
          notification_template_id?: string | null
          priority?: number | null
          trigger_condition: Json
          updated_at?: string | null
        }
        Update: {
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          escalate_to?: string | null
          escalate_to_role?: string | null
          id?: string
          include_lead_history?: boolean | null
          institution_id?: string
          is_active?: boolean | null
          name?: string
          notification_channels?: string[] | null
          notification_template_id?: string | null
          priority?: number | null
          trigger_condition?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_rules_escalate_to_fkey"
            columns: ["escalate_to"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_rules_escalate_to_fkey"
            columns: ["escalate_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      funnel_alert_thresholds: {
        Row: {
          avg_time_critical: number | null
          avg_time_warning: number | null
          created_at: string | null
          critical_threshold: number | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          stage: string
          stuck_days_critical: number | null
          stuck_days_warning: number | null
          updated_at: string | null
          warning_threshold: number | null
        }
        Insert: {
          avg_time_critical?: number | null
          avg_time_warning?: number | null
          created_at?: string | null
          critical_threshold?: number | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          stage: string
          stuck_days_critical?: number | null
          stuck_days_warning?: number | null
          updated_at?: string | null
          warning_threshold?: number | null
        }
        Update: {
          avg_time_critical?: number | null
          avg_time_warning?: number | null
          created_at?: string | null
          critical_threshold?: number | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          stage?: string
          stuck_days_critical?: number | null
          stuck_days_warning?: number | null
          updated_at?: string | null
          warning_threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_alert_thresholds_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_alert_thresholds_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      funnel_snapshots: {
        Row: {
          conversion_rates: Json | null
          created_at: string | null
          funnel_data: Json
          id: string
          institution_id: string
          program_data: Json | null
          snapshot_date: string
          snapshot_type: string
          source_data: Json | null
        }
        Insert: {
          conversion_rates?: Json | null
          created_at?: string | null
          funnel_data: Json
          id?: string
          institution_id: string
          program_data?: Json | null
          snapshot_date: string
          snapshot_type: string
          source_data?: Json | null
        }
        Update: {
          conversion_rates?: Json | null
          created_at?: string | null
          funnel_data?: Json
          id?: string
          institution_id?: string
          program_data?: Json | null
          snapshot_date?: string
          snapshot_type?: string
          source_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_snapshots_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_snapshots_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      grievance_categories: {
        Row: {
          created_at: string | null
          default_assignee_role: string | null
          default_sla_hours: number | null
          description: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_assignee_role?: string | null
          default_sla_hours?: number | null
          description?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_assignee_role?: string | null
          default_sla_hours?: number | null
          description?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grievance_categories_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grievance_categories_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "grievance_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "grievance_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      grievance_comments: {
        Row: {
          attachments: Json | null
          author_id: string | null
          author_name: string
          author_type: string
          content: string
          created_at: string | null
          id: string
          is_internal: boolean | null
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          author_name: string
          author_type: string
          content: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string
          author_type?: string
          content?: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grievance_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "grievance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      grievance_history: {
        Row: {
          action: string
          id: string
          new_value: string | null
          old_value: string | null
          performed_at: string | null
          performed_by: string | null
          ticket_id: string
        }
        Insert: {
          action: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_at?: string | null
          performed_by?: string | null
          ticket_id: string
        }
        Update: {
          action?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_at?: string | null
          performed_by?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grievance_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "grievance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      grievance_tickets: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          attachments: Json | null
          category_id: string
          created_at: string | null
          department_id: string | null
          description: string
          id: string
          institution_id: string
          metadata: Json | null
          priority: string | null
          raised_by_email: string | null
          raised_by_id: string | null
          raised_by_name: string
          raised_by_phone: string | null
          raised_by_type: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          satisfaction_feedback: string | null
          satisfaction_rating: number | null
          sla_deadline: string
          sla_hours: number
          sla_status: string | null
          status: string | null
          subject: string
          ticket_number: string
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          category_id: string
          created_at?: string | null
          department_id?: string | null
          description: string
          id?: string
          institution_id: string
          metadata?: Json | null
          priority?: string | null
          raised_by_email?: string | null
          raised_by_id?: string | null
          raised_by_name: string
          raised_by_phone?: string | null
          raised_by_type: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          satisfaction_feedback?: string | null
          satisfaction_rating?: number | null
          sla_deadline: string
          sla_hours: number
          sla_status?: string | null
          status?: string | null
          subject: string
          ticket_number: string
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          category_id?: string
          created_at?: string | null
          department_id?: string | null
          description?: string
          id?: string
          institution_id?: string
          metadata?: Json | null
          priority?: string | null
          raised_by_email?: string | null
          raised_by_id?: string | null
          raised_by_name?: string
          raised_by_phone?: string | null
          raised_by_type?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          satisfaction_feedback?: string | null
          satisfaction_rating?: number | null
          sla_deadline?: string
          sla_hours?: number
          sla_status?: string | null
          status?: string | null
          subject?: string
          ticket_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grievance_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "grievance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grievance_tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grievance_tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "grievance_tickets_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grievance_tickets_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      hostel_allocation_requests: {
        Row: {
          allocated_bed_id: string | null
          allocation_id: string | null
          application_id: string | null
          created_at: string | null
          has_medical_condition: boolean | null
          id: string
          institution_id: string
          medical_notes: string | null
          prefer_ac: boolean | null
          prefer_attached_bathroom: boolean | null
          preferred_floor: number | null
          preferred_hostel_id: string | null
          preferred_hostel_type: string | null
          preferred_room_type: string | null
          preferred_roommate_ids: string[] | null
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          request_for_semester: string | null
          request_for_year: string
          request_status: string | null
          special_requirements: string | null
          student_id: string
          updated_at: string | null
          waitlist_position: number | null
        }
        Insert: {
          allocated_bed_id?: string | null
          allocation_id?: string | null
          application_id?: string | null
          created_at?: string | null
          has_medical_condition?: boolean | null
          id?: string
          institution_id: string
          medical_notes?: string | null
          prefer_ac?: boolean | null
          prefer_attached_bathroom?: boolean | null
          preferred_floor?: number | null
          preferred_hostel_id?: string | null
          preferred_hostel_type?: string | null
          preferred_room_type?: string | null
          preferred_roommate_ids?: string[] | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          request_for_semester?: string | null
          request_for_year: string
          request_status?: string | null
          special_requirements?: string | null
          student_id: string
          updated_at?: string | null
          waitlist_position?: number | null
        }
        Update: {
          allocated_bed_id?: string | null
          allocation_id?: string | null
          application_id?: string | null
          created_at?: string | null
          has_medical_condition?: boolean | null
          id?: string
          institution_id?: string
          medical_notes?: string | null
          prefer_ac?: boolean | null
          prefer_attached_bathroom?: boolean | null
          preferred_floor?: number | null
          preferred_hostel_id?: string | null
          preferred_hostel_type?: string | null
          preferred_room_type?: string | null
          preferred_roommate_ids?: string[] | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          request_for_semester?: string | null
          request_for_year?: string
          request_status?: string | null
          special_requirements?: string | null
          student_id?: string
          updated_at?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_allocation_requests_allocated_bed_id_fkey"
            columns: ["allocated_bed_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["bed_id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_allocated_bed_id_fkey"
            columns: ["allocated_bed_id"]
            isOneToOne: false
            referencedRelation: "hostel_beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["allocation_id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "hostel_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_preferred_hostel_id_fkey"
            columns: ["preferred_hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_preferred_hostel_id_fkey"
            columns: ["preferred_hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_preferred_hostel_id_fkey"
            columns: ["preferred_hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_allocation_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_allocations: {
        Row: {
          academic_year: string
          agreed_fee_per_month: number | null
          agreed_fee_per_semester: number | null
          allocation_status: string | null
          application_id: string | null
          approved_at: string | null
          approved_by: string | null
          bed_id: string
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          fee_paid_till: string | null
          hostel_id: string
          id: string
          institution_id: string
          metadata: Json | null
          room_id: string
          semester: string | null
          start_date: string
          student_id: string
          student_type: string
          updated_at: string | null
          vacate_note: string | null
          vacate_reason: string | null
        }
        Insert: {
          academic_year: string
          agreed_fee_per_month?: number | null
          agreed_fee_per_semester?: number | null
          allocation_status?: string | null
          application_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bed_id: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          fee_paid_till?: string | null
          hostel_id: string
          id?: string
          institution_id: string
          metadata?: Json | null
          room_id: string
          semester?: string | null
          start_date: string
          student_id: string
          student_type: string
          updated_at?: string | null
          vacate_note?: string | null
          vacate_reason?: string | null
        }
        Update: {
          academic_year?: string
          agreed_fee_per_month?: number | null
          agreed_fee_per_semester?: number | null
          allocation_status?: string | null
          application_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bed_id?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          fee_paid_till?: string | null
          hostel_id?: string
          id?: string
          institution_id?: string
          metadata?: Json | null
          room_id?: string
          semester?: string | null
          start_date?: string
          student_id?: string
          student_type?: string
          updated_at?: string | null
          vacate_note?: string | null
          vacate_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_allocations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_allocations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["bed_id"]
          },
          {
            foreignKeyName: "hostel_allocations_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "hostel_beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_allocations_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_allocations_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "hostel_allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "hostel_allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_room_availability"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "hostel_allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_attendance: {
        Row: {
          allocation_id: string
          attendance_date: string
          check_in_time: string | null
          check_out_time: string | null
          expected_return_date: string | null
          id: string
          leave_reason: string | null
          leave_type: string | null
          marked_at: string | null
          marked_by: string | null
          status: string | null
        }
        Insert: {
          allocation_id: string
          attendance_date: string
          check_in_time?: string | null
          check_out_time?: string | null
          expected_return_date?: string | null
          id?: string
          leave_reason?: string | null
          leave_type?: string | null
          marked_at?: string | null
          marked_by?: string | null
          status?: string | null
        }
        Update: {
          allocation_id?: string
          attendance_date?: string
          check_in_time?: string | null
          check_out_time?: string | null
          expected_return_date?: string | null
          id?: string
          leave_reason?: string | null
          leave_type?: string | null
          marked_at?: string | null
          marked_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_attendance_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["allocation_id"]
          },
          {
            foreignKeyName: "hostel_attendance_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "hostel_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_beds: {
        Row: {
          bed_number: string
          bed_position: string | null
          bed_status: string | null
          created_at: string | null
          current_allocation_id: string | null
          current_occupant_id: string | null
          id: string
          room_id: string
          updated_at: string | null
        }
        Insert: {
          bed_number: string
          bed_position?: string | null
          bed_status?: string | null
          created_at?: string | null
          current_allocation_id?: string | null
          current_occupant_id?: string | null
          id?: string
          room_id: string
          updated_at?: string | null
        }
        Update: {
          bed_number?: string
          bed_position?: string | null
          bed_status?: string | null
          created_at?: string | null
          current_allocation_id?: string | null
          current_occupant_id?: string | null
          id?: string
          room_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "hostel_beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_room_availability"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "hostel_beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_complaints: {
        Row: {
          allocation_id: string | null
          assigned_at: string | null
          assigned_to: string | null
          attachment_urls: string[] | null
          category: string
          complaint_status: string | null
          created_at: string | null
          description: string
          feedback: string | null
          hostel_id: string
          id: string
          institution_id: string
          priority: string | null
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          satisfaction_rating: number | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          allocation_id?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attachment_urls?: string[] | null
          category: string
          complaint_status?: string | null
          created_at?: string | null
          description: string
          feedback?: string | null
          hostel_id: string
          id?: string
          institution_id: string
          priority?: string | null
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          satisfaction_rating?: number | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          allocation_id?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attachment_urls?: string[] | null
          category?: string
          complaint_status?: string | null
          created_at?: string | null
          description?: string
          feedback?: string | null
          hostel_id?: string
          id?: string
          institution_id?: string
          priority?: string | null
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          satisfaction_rating?: number | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_complaints_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["allocation_id"]
          },
          {
            foreignKeyName: "hostel_complaints_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "hostel_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_complaints_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_complaints_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_complaints_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_complaints_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_complaints_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "hostel_complaints_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_complaints_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_complaints_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_complaints_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_complaints_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "hostel_complaints_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_room_availability"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "hostel_complaints_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_fee_structure: {
        Row: {
          ac_charges_per_month: number | null
          academic_year: string
          created_at: string | null
          effective_from: string
          effective_till: string | null
          electricity_charges: number | null
          hostel_id: string
          id: string
          institution_id: string
          is_active: boolean | null
          laundry_charges_per_month: number | null
          maintenance_charges: number | null
          mess_fee_per_month: number | null
          mess_fee_per_semester: number | null
          room_rent_per_month: number | null
          room_rent_per_semester: number | null
          room_type: string
          security_deposit: number | null
          updated_at: string | null
        }
        Insert: {
          ac_charges_per_month?: number | null
          academic_year: string
          created_at?: string | null
          effective_from: string
          effective_till?: string | null
          electricity_charges?: number | null
          hostel_id: string
          id?: string
          institution_id: string
          is_active?: boolean | null
          laundry_charges_per_month?: number | null
          maintenance_charges?: number | null
          mess_fee_per_month?: number | null
          mess_fee_per_semester?: number | null
          room_rent_per_month?: number | null
          room_rent_per_semester?: number | null
          room_type: string
          security_deposit?: number | null
          updated_at?: string | null
        }
        Update: {
          ac_charges_per_month?: number | null
          academic_year?: string
          created_at?: string | null
          effective_from?: string
          effective_till?: string | null
          electricity_charges?: number | null
          hostel_id?: string
          id?: string
          institution_id?: string
          is_active?: boolean | null
          laundry_charges_per_month?: number | null
          maintenance_charges?: number | null
          mess_fee_per_month?: number | null
          mess_fee_per_semester?: number | null
          room_rent_per_month?: number | null
          room_rent_per_semester?: number | null
          room_type?: string
          security_deposit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_fee_structure_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_fee_structure_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_fee_structure_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_fee_structure_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_fee_structure_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      hostel_floors: {
        Row: {
          created_at: string | null
          floor_name: string | null
          floor_number: number
          floor_warden_id: string | null
          hostel_id: string
          id: string
          is_active: boolean | null
          total_beds: number | null
          total_rooms: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          floor_name?: string | null
          floor_number: number
          floor_warden_id?: string | null
          hostel_id: string
          id?: string
          is_active?: boolean | null
          total_beds?: number | null
          total_rooms?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          floor_name?: string | null
          floor_number?: number
          floor_warden_id?: string | null
          hostel_id?: string
          id?: string
          is_active?: boolean | null
          total_beds?: number | null
          total_rooms?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_floors_floor_warden_id_fkey"
            columns: ["floor_warden_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_floors_floor_warden_id_fkey"
            columns: ["floor_warden_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_floors_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_floors_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_floors_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_rooms: {
        Row: {
          created_at: string | null
          fee_modifier_per_month: number | null
          fee_modifier_per_semester: number | null
          floor_id: string
          has_ac: boolean | null
          has_attached_bathroom: boolean | null
          has_balcony: boolean | null
          has_study_table: boolean | null
          has_wardrobe: boolean | null
          hostel_id: string
          id: string
          is_active: boolean | null
          last_maintenance_at: string | null
          next_maintenance_at: string | null
          occupied_beds: number | null
          room_number: string
          room_status: string | null
          room_type: string
          total_beds: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fee_modifier_per_month?: number | null
          fee_modifier_per_semester?: number | null
          floor_id: string
          has_ac?: boolean | null
          has_attached_bathroom?: boolean | null
          has_balcony?: boolean | null
          has_study_table?: boolean | null
          has_wardrobe?: boolean | null
          hostel_id: string
          id?: string
          is_active?: boolean | null
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          occupied_beds?: number | null
          room_number: string
          room_status?: string | null
          room_type: string
          total_beds?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fee_modifier_per_month?: number | null
          fee_modifier_per_semester?: number | null
          floor_id?: string
          has_ac?: boolean | null
          has_attached_bathroom?: boolean | null
          has_balcony?: boolean | null
          has_study_table?: boolean | null
          has_wardrobe?: boolean | null
          hostel_id?: string
          id?: string
          is_active?: boolean | null
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          occupied_beds?: number | null
          room_number?: string
          room_status?: string | null
          room_type?: string
          total_beds?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "hostel_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_wardens: {
        Row: {
          created_at: string | null
          duty_phone: string | null
          end_date: string | null
          floor_id: string | null
          hostel_id: string
          id: string
          is_active: boolean | null
          start_date: string
          updated_at: string | null
          warden_id: string
          warden_type: string
        }
        Insert: {
          created_at?: string | null
          duty_phone?: string | null
          end_date?: string | null
          floor_id?: string | null
          hostel_id: string
          id?: string
          is_active?: boolean | null
          start_date: string
          updated_at?: string | null
          warden_id: string
          warden_type: string
        }
        Update: {
          created_at?: string | null
          duty_phone?: string | null
          end_date?: string | null
          floor_id?: string | null
          hostel_id?: string
          id?: string
          is_active?: boolean | null
          start_date?: string
          updated_at?: string | null
          warden_id?: string
          warden_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hostel_wardens_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "hostel_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_wardens_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_wardens_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_wardens_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_wardens_warden_id_fkey"
            columns: ["warden_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostel_wardens_warden_id_fkey"
            columns: ["warden_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hostels: {
        Row: {
          address: string | null
          amenities: string[] | null
          base_fee_per_month: number | null
          base_fee_per_semester: number | null
          chief_warden_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          hostel_code: string
          hostel_name: string
          hostel_type: string
          id: string
          institution_id: string
          is_active: boolean | null
          landmark: string | null
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          total_beds: number | null
          total_floors: number | null
          total_rooms: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          base_fee_per_month?: number | null
          base_fee_per_semester?: number | null
          chief_warden_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          hostel_code: string
          hostel_name: string
          hostel_type: string
          id?: string
          institution_id: string
          is_active?: boolean | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          total_beds?: number | null
          total_floors?: number | null
          total_rooms?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          base_fee_per_month?: number | null
          base_fee_per_semester?: number | null
          chief_warden_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          hostel_code?: string
          hostel_name?: string
          hostel_type?: string
          id?: string
          institution_id?: string
          is_active?: boolean | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          total_beds?: number | null
          total_floors?: number | null
          total_rooms?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostels_chief_warden_id_fkey"
            columns: ["chief_warden_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostels_chief_warden_id_fkey"
            columns: ["chief_warden_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hostels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
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
          institution_code: string | null
          institution_name: string | null
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
          institution_code?: string | null
          institution_name?: string | null
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
          institution_code?: string | null
          institution_name?: string | null
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
      interview_bookings: {
        Row: {
          application_id: string
          booked_at: string | null
          booked_by: string | null
          completed_at: string | null
          created_at: string | null
          feedback: Json | null
          id: string
          institution_id: string
          internal_notes: string | null
          interviewer_notes: string | null
          outcome: Database["public"]["Enums"]["interview_outcome"] | null
          panel_members: string[] | null
          previous_slot_id: string | null
          score: number | null
          slot_id: string
          status: Database["public"]["Enums"]["interview_status"] | null
          updated_at: string | null
        }
        Insert: {
          application_id: string
          booked_at?: string | null
          booked_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          feedback?: Json | null
          id?: string
          institution_id: string
          internal_notes?: string | null
          interviewer_notes?: string | null
          outcome?: Database["public"]["Enums"]["interview_outcome"] | null
          panel_members?: string[] | null
          previous_slot_id?: string | null
          score?: number | null
          slot_id: string
          status?: Database["public"]["Enums"]["interview_status"] | null
          updated_at?: string | null
        }
        Update: {
          application_id?: string
          booked_at?: string | null
          booked_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          feedback?: Json | null
          id?: string
          institution_id?: string
          internal_notes?: string | null
          interviewer_notes?: string | null
          outcome?: Database["public"]["Enums"]["interview_outcome"] | null
          panel_members?: string[] | null
          previous_slot_id?: string | null
          score?: number | null
          slot_id?: string
          status?: Database["public"]["Enums"]["interview_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_bookings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_bookings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interview_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_bookings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_bookings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "interview_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "interview_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_slots: {
        Row: {
          booked_count: number | null
          capacity: number
          created_at: string | null
          created_by: string | null
          default_panel_members: string[] | null
          end_time: string
          id: string
          institution_id: string
          interview_type: string | null
          is_available: boolean | null
          is_online: boolean | null
          location: string | null
          meeting_link: string | null
          program_id: string | null
          slot_date: string
          start_time: string
        }
        Insert: {
          booked_count?: number | null
          capacity?: number
          created_at?: string | null
          created_by?: string | null
          default_panel_members?: string[] | null
          end_time: string
          id?: string
          institution_id: string
          interview_type?: string | null
          is_available?: boolean | null
          is_online?: boolean | null
          location?: string | null
          meeting_link?: string | null
          program_id?: string | null
          slot_date: string
          start_time: string
        }
        Update: {
          booked_count?: number | null
          capacity?: number
          created_at?: string | null
          created_by?: string | null
          default_panel_members?: string[] | null
          end_time?: string
          id?: string
          institution_id?: string
          interview_type?: string | null
          is_available?: boolean | null
          is_online?: boolean | null
          location?: string | null
          meeting_link?: string | null
          program_id?: string | null
          slot_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interview_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_slots_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_slots_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      lateral_entry_applications: {
        Row: {
          academic_score: number | null
          admission_id: string | null
          application_number: string
          application_status: string
          application_type: string
          applied_program_id: string | null
          applied_program_name: string
          approval_notes: string | null
          cgpa: number | null
          created_at: string
          current_institution: string
          current_program: string
          current_year: string
          date_of_birth: string | null
          documents: Json | null
          documents_uploaded: boolean | null
          eligibility_notes: string | null
          eligibility_status: string
          email: string
          id: string
          institution_id: string
          ip_address: unknown
          phone: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          student_id: string | null
          student_name: string
          target_year: number | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          academic_score?: number | null
          admission_id?: string | null
          application_number: string
          application_status?: string
          application_type: string
          applied_program_id?: string | null
          applied_program_name: string
          approval_notes?: string | null
          cgpa?: number | null
          created_at?: string
          current_institution: string
          current_program: string
          current_year: string
          date_of_birth?: string | null
          documents?: Json | null
          documents_uploaded?: boolean | null
          eligibility_notes?: string | null
          eligibility_status?: string
          email: string
          id?: string
          institution_id: string
          ip_address?: unknown
          phone?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          student_id?: string | null
          student_name: string
          target_year?: number | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          academic_score?: number | null
          admission_id?: string | null
          application_number?: string
          application_status?: string
          application_type?: string
          applied_program_id?: string | null
          applied_program_name?: string
          approval_notes?: string | null
          cgpa?: number | null
          created_at?: string
          current_institution?: string
          current_program?: string
          current_year?: string
          date_of_birth?: string | null
          documents?: Json | null
          documents_uploaded?: boolean | null
          eligibility_notes?: string | null
          eligibility_status?: string
          email?: string
          id?: string
          institution_id?: string
          ip_address?: unknown
          phone?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          student_id?: string | null
          student_name?: string
          target_year?: number | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lateral_entry_applications_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_applied_program_id_fkey"
            columns: ["applied_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lateral_entry_documents: {
        Row: {
          application_id: string
          created_at: string
          document_name: string
          document_type: string
          file_size: number | null
          file_url: string
          id: string
          is_verified: boolean | null
          mime_type: string | null
          updated_at: string
          uploaded_at: string
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          document_name: string
          document_type: string
          file_size?: number | null
          file_url: string
          id?: string
          is_verified?: boolean | null
          mime_type?: string | null
          updated_at?: string
          uploaded_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          document_name?: string
          document_type?: string
          file_size?: number | null
          file_url?: string
          id?: string
          is_verified?: boolean | null
          mime_type?: string | null
          updated_at?: string
          uploaded_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lateral_entry_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "lateral_entry_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "lateral_entry_applications_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lateral_entry_eligibility_rules: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entrance_exam_name: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          max_age: number | null
          max_score: number | null
          min_cgpa: number | null
          min_score: number | null
          required_documents: Json | null
          requirements: Json
          requires_entrance_exam: boolean | null
          rule_type: string
          target_program_id: string | null
          target_program_name: string | null
          target_year: string
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entrance_exam_name?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          max_age?: number | null
          max_score?: number | null
          min_cgpa?: number | null
          min_score?: number | null
          required_documents?: Json | null
          requirements?: Json
          requires_entrance_exam?: boolean | null
          rule_type: string
          target_program_id?: string | null
          target_program_name?: string | null
          target_year: string
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entrance_exam_name?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          max_age?: number | null
          max_score?: number | null
          min_cgpa?: number | null
          min_score?: number | null
          required_documents?: Json | null
          requirements?: Json
          requires_entrance_exam?: boolean | null
          rule_type?: string
          target_program_id?: string | null
          target_program_name?: string | null
          target_year?: string
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lateral_entry_eligibility_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_eligibility_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_eligibility_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lateral_entry_eligibility_rules_target_program_id_fkey"
            columns: ["target_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      lateral_entry_vacancies: {
        Row: {
          academic_year: string
          available_lateral: number | null
          available_regular: number | null
          closes_at: string | null
          created_at: string
          id: string
          institution_id: string
          is_open: boolean | null
          lateral_entry_seats: number
          lateral_filled: number
          notes: string | null
          opens_at: string | null
          program_id: string
          program_name: string
          regular_filled: number
          regular_seats: number
          semester: string | null
          total_intake: number
          updated_at: string
        }
        Insert: {
          academic_year: string
          available_lateral?: number | null
          available_regular?: number | null
          closes_at?: string | null
          created_at?: string
          id?: string
          institution_id: string
          is_open?: boolean | null
          lateral_entry_seats?: number
          lateral_filled?: number
          notes?: string | null
          opens_at?: string | null
          program_id: string
          program_name: string
          regular_filled?: number
          regular_seats?: number
          semester?: string | null
          total_intake?: number
          updated_at?: string
        }
        Update: {
          academic_year?: string
          available_lateral?: number | null
          available_regular?: number | null
          closes_at?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          is_open?: boolean | null
          lateral_entry_seats?: number
          lateral_filled?: number
          notes?: string | null
          opens_at?: string | null
          program_id?: string
          program_name?: string
          regular_filled?: number
          regular_seats?: number
          semester?: string | null
          total_intake?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lateral_entry_vacancies_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_vacancies_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lateral_entry_vacancies_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity_log: {
        Row: {
          activity_description: string | null
          activity_type: string
          channel:
            | Database["public"]["Enums"]["communication_channel_type"]
            | null
          created_at: string | null
          id: string
          is_system_generated: boolean | null
          lead_id: string
          metadata: Json | null
          performed_by: string | null
          score_change: number | null
          score_type: string | null
        }
        Insert: {
          activity_description?: string | null
          activity_type: string
          channel?:
            | Database["public"]["Enums"]["communication_channel_type"]
            | null
          created_at?: string | null
          id?: string
          is_system_generated?: boolean | null
          lead_id: string
          metadata?: Json | null
          performed_by?: string | null
          score_change?: number | null
          score_type?: string | null
        }
        Update: {
          activity_description?: string | null
          activity_type?: string
          channel?:
            | Database["public"]["Enums"]["communication_channel_type"]
            | null
          created_at?: string | null
          id?: string
          is_system_generated?: boolean | null
          lead_id?: string
          metadata?: Json | null
          performed_by?: string | null
          score_change?: number | null
          score_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_activity_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lead_activity_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string | null
          id: string
          is_first_touch: boolean | null
          is_last_touch: boolean | null
          landing_page: string | null
          lead_id: string
          partner_id: string | null
          partner_name: string | null
          referral_code: string | null
          referrer: string | null
          source_name: string
          source_type: Database["public"]["Enums"]["source_type"]
          touch_number: number | null
          touched_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_first_touch?: boolean | null
          is_last_touch?: boolean | null
          landing_page?: string | null
          lead_id: string
          partner_id?: string | null
          partner_name?: string | null
          referral_code?: string | null
          referrer?: string | null
          source_name: string
          source_type: Database["public"]["Enums"]["source_type"]
          touch_number?: number | null
          touched_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_first_touch?: boolean | null
          is_last_touch?: boolean | null
          landing_page?: string | null
          lead_id?: string
          partner_id?: string | null
          partner_name?: string | null
          referral_code?: string | null
          referrer?: string | null
          source_name?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          touch_number?: number | null
          touched_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_stage: string | null
          id: string
          institution_id: string
          lead_id: string
          time_in_previous_stage: unknown
          to_stage: string
          transitioned_at: string | null
          trigger_reason: string | null
          triggered_by: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_stage?: string | null
          id?: string
          institution_id: string
          lead_id: string
          time_in_previous_stage?: unknown
          to_stage: string
          transitioned_at?: string | null
          trigger_reason?: string | null
          triggered_by?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_stage?: string | null
          id?: string
          institution_id?: string
          lead_id?: string
          time_in_previous_stage?: unknown
          to_stage?: string
          transitioned_at?: string | null
          trigger_reason?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
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
      learner_core_okrs: {
        Row: {
          auto_source_config: Json | null
          auto_source_module: string
          created_at: string
          created_by: string
          department_id: string | null
          id: string
          institution_id: string
          is_active: boolean
          kr_description: string | null
          kr_title: string
          order_index: number
          program_id: string | null
          semester: string | null
          start_value: number
          target_value: number
          unit: string
          updated_at: string
        }
        Insert: {
          auto_source_config?: Json | null
          auto_source_module: string
          created_at?: string
          created_by: string
          department_id?: string | null
          id?: string
          institution_id: string
          is_active?: boolean
          kr_description?: string | null
          kr_title: string
          order_index?: number
          program_id?: string | null
          semester?: string | null
          start_value?: number
          target_value: number
          unit: string
          updated_at?: string
        }
        Update: {
          auto_source_config?: Json | null
          auto_source_module?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean
          kr_description?: string | null
          kr_title?: string
          order_index?: number
          program_id?: string | null
          semester?: string | null
          start_value?: number
          target_value?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_core_okrs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_core_okrs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "learner_core_okrs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_core_okrs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "learner_core_okrs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_elective_okrs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          baseline_value: number | null
          created_at: string
          current_value: number | null
          deadline: string
          description: string | null
          id: string
          is_active: boolean
          learner_id: string
          progress: number | null
          start_value: number | null
          status: string
          target_value: number | null
          title: string
          unit: string | null
          updated_at: string
          why_matters: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          baseline_value?: number | null
          created_at?: string
          current_value?: number | null
          deadline: string
          description?: string | null
          id?: string
          is_active?: boolean
          learner_id: string
          progress?: number | null
          start_value?: number | null
          status?: string
          target_value?: number | null
          title: string
          unit?: string | null
          updated_at?: string
          why_matters?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          baseline_value?: number | null
          created_at?: string
          current_value?: number | null
          deadline?: string
          description?: string | null
          id?: string
          is_active?: boolean
          learner_id?: string
          progress?: number | null
          start_value?: number | null
          status?: string
          target_value?: number | null
          title?: string
          unit?: string | null
          updated_at?: string
          why_matters?: string | null
        }
        Relationships: []
      }
      learner_okr_assignments: {
        Row: {
          academic_year: string
          core_okr_id: string
          created_at: string
          current_value: number | null
          id: string
          is_active: boolean
          learner_id: string
          progress: number | null
          semester: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          core_okr_id: string
          created_at?: string
          current_value?: number | null
          id?: string
          is_active?: boolean
          learner_id: string
          progress?: number | null
          semester: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          core_okr_id?: string
          created_at?: string
          current_value?: number | null
          id?: string
          is_active?: boolean
          learner_id?: string
          progress?: number | null
          semester?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_okr_assignments_core_okr_id_fkey"
            columns: ["core_okr_id"]
            isOneToOne: false
            referencedRelation: "learner_core_okrs"
            referencedColumns: ["id"]
          },
        ]
      }
      learners_profiles: {
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
          created_at: string
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
          first_name: string
          food_type: string | null
          gender: string | null
          hostel_type: string | null
          id: string
          institution_id: string | null
          is_profile_complete: boolean | null
          last_name: string | null
          last_school: string | null
          lifecycle_status: Database["public"]["Enums"]["lifecycle_status"]
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
          scholarship_type: string | null
          section_id: string | null
          semester_id: string | null
          student_email: string | null
          student_mobile: string
          student_photo_url: string | null
          tenth_marks: Json | null
          twelfth_marks: Json | null
          updated_at: string
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
          created_at?: string
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
          first_name: string
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          lifecycle_status?: Database["public"]["Enums"]["lifecycle_status"]
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
          scholarship_type?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string | null
          student_mobile: string
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
          updated_at?: string
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
          created_at?: string
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
          first_name?: string
          food_type?: string | null
          gender?: string | null
          hostel_type?: string | null
          id?: string
          institution_id?: string | null
          is_profile_complete?: boolean | null
          last_name?: string | null
          last_school?: string | null
          lifecycle_status?: Database["public"]["Enums"]["lifecycle_status"]
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
          scholarship_type?: string | null
          section_id?: string | null
          semester_id?: string | null
          student_email?: string | null
          student_mobile?: string
          student_photo_url?: string | null
          tenth_marks?: Json | null
          twelfth_marks?: Json | null
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
            foreignKeyName: "fk_learners_profiles_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
            foreignKeyName: "lti_grades_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
            foreignKeyName: "lti_launches_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
      maturity_assessments: {
        Row: {
          assessment_date: string
          assessor_id: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          dimension_scores: Json
          evidence: string | null
          framework_id: string
          id: string
          improvement_plan: string | null
          institution_id: string
          overall_stage: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          target_date: string | null
          target_stage: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          assessment_date: string
          assessor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          dimension_scores?: Json
          evidence?: string | null
          framework_id: string
          id?: string
          improvement_plan?: string | null
          institution_id: string
          overall_stage: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          target_date?: string | null
          target_stage?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          assessment_date?: string
          assessor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          dimension_scores?: Json
          evidence?: string | null
          framework_id?: string
          id?: string
          improvement_plan?: string | null
          institution_id?: string
          overall_stage?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          target_date?: string | null
          target_stage?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maturity_assessments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_assessments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "maturity_assessments_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "maturity_frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_assessments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_assessments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      maturity_evidence: {
        Row: {
          assessment_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          dimension: string
          file_type: string | null
          file_url: string | null
          id: string
          title: string
        }
        Insert: {
          assessment_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          dimension: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          title: string
        }
        Update: {
          assessment_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          dimension?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "maturity_evidence_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "maturity_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_evidence_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["assessment_id"]
          },
        ]
      }
      maturity_frameworks: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          dimensions: Json
          id: string
          institution_id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          dimensions?: Json
          id?: string
          institution_id: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          dimensions?: Json
          id?: string
          institution_id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maturity_frameworks_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_frameworks_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      maturity_progress: {
        Row: {
          action_item: string
          assessment_id: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          dimension: string
          due_date: string | null
          id: string
          notes: string | null
          status: string | null
          target_stage: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          action_item: string
          assessment_id: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          dimension: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          target_stage: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          action_item?: string
          assessment_id?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          dimension?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          target_stage?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maturity_progress_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "maturity_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_progress_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["assessment_id"]
          },
        ]
      }
      merit_lists: {
        Row: {
          academic_year: string
          category: string | null
          created_at: string | null
          created_by: string | null
          cutoff_rank: number | null
          cutoff_score: number | null
          entries: Json | null
          id: string
          institution_id: string
          is_published: boolean | null
          list_name: string
          program_id: string
          published_at: string | null
          total_entries: number | null
        }
        Insert: {
          academic_year: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          cutoff_rank?: number | null
          cutoff_score?: number | null
          entries?: Json | null
          id?: string
          institution_id: string
          is_published?: boolean | null
          list_name: string
          program_id: string
          published_at?: string | null
          total_entries?: number | null
        }
        Update: {
          academic_year?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          cutoff_rank?: number | null
          cutoff_score?: number | null
          entries?: Json | null
          id?: string
          institution_id?: string
          is_published?: boolean | null
          list_name?: string
          program_id?: string
          published_at?: string | null
          total_entries?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "merit_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merit_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merit_lists_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merit_lists_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      message_templates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          buttons: Json | null
          category: string
          channel: Database["public"]["Enums"]["communication_channel_type"]
          created_at: string | null
          created_by: string | null
          footer: string | null
          header: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          is_approved: boolean | null
          language: string | null
          name: string
          slug: string
          subject: string | null
          updated_at: string | null
          variables: string[] | null
          whatsapp_template_id: string | null
          whatsapp_template_status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          buttons?: Json | null
          category: string
          channel: Database["public"]["Enums"]["communication_channel_type"]
          created_at?: string | null
          created_by?: string | null
          footer?: string | null
          header?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_approved?: boolean | null
          language?: string | null
          name: string
          slug: string
          subject?: string | null
          updated_at?: string | null
          variables?: string[] | null
          whatsapp_template_id?: string | null
          whatsapp_template_status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          buttons?: Json | null
          category?: string
          channel?: Database["public"]["Enums"]["communication_channel_type"]
          created_at?: string | null
          created_by?: string | null
          footer?: string | null
          header?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_approved?: boolean | null
          language?: string | null
          name?: string
          slug?: string
          subject?: string | null
          updated_at?: string | null
          variables?: string[] | null
          whatsapp_template_id?: string | null
          whatsapp_template_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
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
      nps_analytics: {
        Row: {
          calculated_at: string
          department_id: string | null
          detractors: number
          id: string
          institution_id: string
          nps_score: number | null
          passives: number
          period_end: string
          period_start: string
          promoters: number
          stakeholder_type: Database["public"]["Enums"]["stakeholder_type"]
          survey_id: string | null
          total_responses: number
        }
        Insert: {
          calculated_at?: string
          department_id?: string | null
          detractors?: number
          id?: string
          institution_id: string
          nps_score?: number | null
          passives?: number
          period_end: string
          period_start: string
          promoters?: number
          stakeholder_type: Database["public"]["Enums"]["stakeholder_type"]
          survey_id?: string | null
          total_responses?: number
        }
        Update: {
          calculated_at?: string
          department_id?: string | null
          detractors?: number
          id?: string
          institution_id?: string
          nps_score?: number | null
          passives?: number
          period_end?: string
          period_start?: string
          promoters?: number
          stakeholder_type?: Database["public"]["Enums"]["stakeholder_type"]
          survey_id?: string | null
          total_responses?: number
        }
        Relationships: [
          {
            foreignKeyName: "nps_analytics_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_analytics_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "nps_analytics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_analytics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "nps_analytics_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "nps_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          additional_feedback: string | null
          department_id: string | null
          id: string
          ip_address: unknown
          nps_category: Database["public"]["Enums"]["nps_category"] | null
          nps_score: number
          question_responses: Json
          respondent_email: string | null
          respondent_id: string | null
          respondent_name: string | null
          respondent_type: Database["public"]["Enums"]["stakeholder_type"]
          submitted_at: string
          survey_id: string
          user_agent: string | null
        }
        Insert: {
          additional_feedback?: string | null
          department_id?: string | null
          id?: string
          ip_address?: unknown
          nps_category?: Database["public"]["Enums"]["nps_category"] | null
          nps_score: number
          question_responses?: Json
          respondent_email?: string | null
          respondent_id?: string | null
          respondent_name?: string | null
          respondent_type: Database["public"]["Enums"]["stakeholder_type"]
          submitted_at?: string
          survey_id: string
          user_agent?: string | null
        }
        Update: {
          additional_feedback?: string | null
          department_id?: string | null
          id?: string
          ip_address?: unknown
          nps_category?: Database["public"]["Enums"]["nps_category"] | null
          nps_score?: number
          question_responses?: Json
          respondent_email?: string | null
          respondent_id?: string | null
          respondent_name?: string | null
          respondent_type?: Database["public"]["Enums"]["stakeholder_type"]
          submitted_at?: string
          survey_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "nps_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "nps_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_surveys: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          end_date: string
          id: string
          institution_id: string
          program_id: string | null
          questions: Json
          stakeholder_type: Database["public"]["Enums"]["stakeholder_type"]
          start_date: string
          status: Database["public"]["Enums"]["survey_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          end_date: string
          id?: string
          institution_id: string
          program_id?: string | null
          questions?: Json
          stakeholder_type: Database["public"]["Enums"]["stakeholder_type"]
          start_date: string
          status?: Database["public"]["Enums"]["survey_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          end_date?: string
          id?: string
          institution_id?: string
          program_id?: string | null
          questions?: Json
          stakeholder_type?: Database["public"]["Enums"]["stakeholder_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["survey_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "nps_surveys_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "nps_surveys_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_letters: {
        Row: {
          admission_type: string | null
          application_id: string
          campus_offered: string | null
          created_at: string | null
          created_by: string | null
          generated_at: string | null
          id: string
          institution_id: string
          last_reminder_at: string | null
          letter_data: Json | null
          letter_number: string | null
          letter_template_id: string | null
          letter_url: string | null
          program_offered: string
          rejection_category: string | null
          rejection_details: Json | null
          rejection_reason: string | null
          reminder_sent_count: number | null
          response: Database["public"]["Enums"]["offer_response"] | null
          response_at: string | null
          response_notes: string | null
          sent_at: string | null
          sent_via: string[] | null
          valid_until: string | null
        }
        Insert: {
          admission_type?: string | null
          application_id: string
          campus_offered?: string | null
          created_at?: string | null
          created_by?: string | null
          generated_at?: string | null
          id?: string
          institution_id: string
          last_reminder_at?: string | null
          letter_data?: Json | null
          letter_number?: string | null
          letter_template_id?: string | null
          letter_url?: string | null
          program_offered: string
          rejection_category?: string | null
          rejection_details?: Json | null
          rejection_reason?: string | null
          reminder_sent_count?: number | null
          response?: Database["public"]["Enums"]["offer_response"] | null
          response_at?: string | null
          response_notes?: string | null
          sent_at?: string | null
          sent_via?: string[] | null
          valid_until?: string | null
        }
        Update: {
          admission_type?: string | null
          application_id?: string
          campus_offered?: string | null
          created_at?: string | null
          created_by?: string | null
          generated_at?: string | null
          id?: string
          institution_id?: string
          last_reminder_at?: string | null
          letter_data?: Json | null
          letter_number?: string | null
          letter_template_id?: string | null
          letter_url?: string | null
          program_offered?: string
          rejection_category?: string | null
          rejection_details?: Json | null
          rejection_reason?: string | null
          reminder_sent_count?: number | null
          response?: Database["public"]["Enums"]["offer_response"] | null
          response_at?: string | null
          response_notes?: string | null
          sent_at?: string | null
          sent_via?: string[] | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_letters_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_letters_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_letters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "offer_letters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_letters_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_letters_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      okr_attachments: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          external_url: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          storage_path: string | null
          thumbnail_path: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          external_url?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          external_url?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      okr_check_ins: {
        Row: {
          blocker_assigned_to: string | null
          blocker_description: string | null
          blocker_flagged: boolean | null
          blocker_resolved: boolean | null
          blocker_resolved_at: string | null
          check_in_date: string | null
          created_at: string
          days_overdue: number | null
          due_date: string
          id: string
          is_completed: boolean
          is_overdue: boolean
          overall_notes: string | null
          updated_at: string
          user_id: string
          week_number: number
          year: number
        }
        Insert: {
          blocker_assigned_to?: string | null
          blocker_description?: string | null
          blocker_flagged?: boolean | null
          blocker_resolved?: boolean | null
          blocker_resolved_at?: string | null
          check_in_date?: string | null
          created_at?: string
          days_overdue?: number | null
          due_date: string
          id?: string
          is_completed?: boolean
          is_overdue?: boolean
          overall_notes?: string | null
          updated_at?: string
          user_id: string
          week_number: number
          year: number
        }
        Update: {
          blocker_assigned_to?: string | null
          blocker_description?: string | null
          blocker_flagged?: boolean | null
          blocker_resolved?: boolean | null
          blocker_resolved_at?: string | null
          check_in_date?: string | null
          created_at?: string
          days_overdue?: number | null
          due_date?: string
          id?: string
          is_completed?: boolean
          is_overdue?: boolean
          overall_notes?: string | null
          updated_at?: string
          user_id?: string
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "okr_check_ins_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_check_ins_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          mentioned_user_ids: string[] | null
          parent_comment_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "okr_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_compliance_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          new_badge: string | null
          performed_by: string
          previous_badge: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_badge?: string | null
          performed_by: string
          previous_badge?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_badge?: string | null
          performed_by?: string
          previous_badge?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      okr_dependencies: {
        Row: {
          created_at: string
          description: string
          id: string
          objective_id: string
          owner_department_id: string | null
          owner_user_id: string | null
          required_by_date: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          objective_id: string
          owner_department_id?: string | null
          owner_user_id?: string | null
          required_by_date: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          objective_id?: string
          owner_department_id?: string | null
          owner_user_id?: string | null
          required_by_date?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_dependencies_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["objective_id"]
          },
          {
            foreignKeyName: "okr_dependencies_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_dependencies_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_dependencies_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
        ]
      }
      okr_key_results: {
        Row: {
          abcd_category: string | null
          created_at: string
          current_value: number
          data_source: string
          data_source_config: Json | null
          deadline: string
          description: string | null
          id: string
          last_synced_at: string | null
          measured_by: string | null
          objective_id: string
          order_index: number
          process_notes: string | null
          process_rating: number | null
          progress_percentage: number | null
          start_value: number
          status: string
          target_value: number
          title: string
          unit: string
          updated_at: string
        }
        Insert: {
          abcd_category?: string | null
          created_at?: string
          current_value?: number
          data_source?: string
          data_source_config?: Json | null
          deadline: string
          description?: string | null
          id?: string
          last_synced_at?: string | null
          measured_by?: string | null
          objective_id: string
          order_index?: number
          process_notes?: string | null
          process_rating?: number | null
          progress_percentage?: number | null
          start_value?: number
          status?: string
          target_value: number
          title: string
          unit?: string
          updated_at?: string
        }
        Update: {
          abcd_category?: string | null
          created_at?: string
          current_value?: number
          data_source?: string
          data_source_config?: Json | null
          deadline?: string
          description?: string | null
          id?: string
          last_synced_at?: string | null
          measured_by?: string | null
          objective_id?: string
          order_index?: number
          process_notes?: string | null
          process_rating?: number | null
          progress_percentage?: number | null
          start_value?: number
          status?: string
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_key_results_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["objective_id"]
          },
          {
            foreignKeyName: "okr_key_results_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_kr_updates: {
        Row: {
          check_in_id: string | null
          created_at: string
          id: string
          is_auto_tracked: boolean | null
          key_result_id: string
          new_value: number
          notes: string | null
          previous_value: number
          updated_by: string
        }
        Insert: {
          check_in_id?: string | null
          created_at?: string
          id?: string
          is_auto_tracked?: boolean | null
          key_result_id: string
          new_value: number
          notes?: string | null
          previous_value: number
          updated_by: string
        }
        Update: {
          check_in_id?: string | null
          created_at?: string
          id?: string
          is_auto_tracked?: boolean | null
          key_result_id?: string
          new_value?: number
          notes?: string | null
          previous_value?: number
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_kr_updates_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "okr_check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_kr_updates_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["key_result_id"]
          },
          {
            foreignKeyName: "okr_kr_updates_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_kr_updates_updated_by_profile_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_kr_updates_updated_by_profile_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_milestones: {
        Row: {
          achieved_at: string
          announced_at: string | null
          celebration_type: string | null
          created_at: string
          id: string
          is_announced: boolean | null
          key_result_id: string | null
          milestone_type: string
          objective_id: string | null
          recognition_notes: string | null
          user_id: string
        }
        Insert: {
          achieved_at?: string
          announced_at?: string | null
          celebration_type?: string | null
          created_at?: string
          id?: string
          is_announced?: boolean | null
          key_result_id?: string | null
          milestone_type: string
          objective_id?: string | null
          recognition_notes?: string | null
          user_id: string
        }
        Update: {
          achieved_at?: string
          announced_at?: string | null
          celebration_type?: string | null
          created_at?: string
          id?: string
          is_announced?: boolean | null
          key_result_id?: string | null
          milestone_type?: string
          objective_id?: string | null
          recognition_notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_milestones_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["key_result_id"]
          },
          {
            foreignKeyName: "okr_milestones_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_milestones_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["objective_id"]
          },
          {
            foreignKeyName: "okr_milestones_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_objectives: {
        Row: {
          ai_integration_notes: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          cycle_type: string
          department_id: string | null
          description: string | null
          end_date: string
          id: string
          institution_id: string | null
          level: string
          overall_progress: number | null
          owner_id: string
          parent_objective_id: string | null
          rationale: string | null
          start_date: string
          status: string
          tier: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_integration_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          cycle_type: string
          department_id?: string | null
          description?: string | null
          end_date: string
          id?: string
          institution_id?: string | null
          level: string
          overall_progress?: number | null
          owner_id: string
          parent_objective_id?: string | null
          rationale?: string | null
          start_date: string
          status?: string
          tier?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_integration_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          cycle_type?: string
          department_id?: string | null
          description?: string | null
          end_date?: string
          id?: string
          institution_id?: string | null
          level?: string
          overall_progress?: number | null
          owner_id?: string
          parent_objective_id?: string | null
          rationale?: string | null
          start_date?: string
          status?: string
          tier?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_objectives_approved_by_profile_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_objectives_approved_by_profile_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_created_by_profile_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_objectives_created_by_profile_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "okr_objectives_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "okr_objectives_owner_profile_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_objectives_owner_profile_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_parent_objective_id_fkey"
            columns: ["parent_objective_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["objective_id"]
          },
          {
            foreignKeyName: "okr_objectives_parent_objective_id_fkey"
            columns: ["parent_objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_reactions: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      okr_risks: {
        Row: {
          created_at: string
          description: string
          id: string
          impact: string
          likelihood: string
          mitigation_strategy: string
          objective_id: string
          owner_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          impact: string
          likelihood: string
          mitigation_strategy: string
          objective_id: string
          owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          impact?: string
          likelihood?: string
          mitigation_strategy?: string
          objective_id?: string
          owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_risks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["objective_id"]
          },
          {
            foreignKeyName: "okr_risks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_tasks: {
        Row: {
          accountable_id: string | null
          consulted_ids: string[] | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          informed_ids: string[] | null
          key_result_id: string | null
          objective_id: string
          order_index: number
          responsible_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          accountable_id?: string | null
          consulted_ids?: string[] | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          informed_ids?: string[] | null
          key_result_id?: string | null
          objective_id: string
          order_index?: number
          responsible_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          accountable_id?: string | null
          consulted_ids?: string[] | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          informed_ids?: string[] | null
          key_result_id?: string | null
          objective_id?: string
          order_index?: number
          responsible_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_tasks_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["key_result_id"]
          },
          {
            foreignKeyName: "okr_tasks_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_tasks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_abcd_analysis"
            referencedColumns: ["objective_id"]
          },
          {
            foreignKeyName: "okr_tasks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_user_status: {
        Row: {
          consecutive_completed: number | null
          consecutive_missed: number | null
          current_badge: string
          id: string
          last_check_in_date: string | null
          next_check_in_due: string | null
          total_check_ins: number | null
          unblock_reason: string | null
          unblocked_at: string | null
          unblocked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consecutive_completed?: number | null
          consecutive_missed?: number | null
          current_badge?: string
          id?: string
          last_check_in_date?: string | null
          next_check_in_due?: string | null
          total_check_ins?: number | null
          unblock_reason?: string | null
          unblocked_at?: string | null
          unblocked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consecutive_completed?: number | null
          consecutive_missed?: number | null
          current_badge?: string
          id?: string
          last_check_in_date?: string | null
          next_check_in_due?: string | null
          total_check_ins?: number | null
          unblock_reason?: string | null
          unblocked_at?: string | null
          unblocked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_user_status_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_user_status_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_activity_log: {
        Row: {
          activity_type: Database["public"]["Enums"]["parent_activity_type"]
          created_at: string | null
          description: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          parent_id: string
          user_agent: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["parent_activity_type"]
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          parent_id: string
          user_agent?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["parent_activity_type"]
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          parent_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_activity_log_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_communications: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string | null
          id: string
          institution_id: string
          learner_id: string | null
          parent_id: string | null
          priority: Database["public"]["Enums"]["communication_priority"] | null
          read_at: string | null
          sender_id: string | null
          subject: string
          type: Database["public"]["Enums"]["communication_type"]
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string | null
          id?: string
          institution_id: string
          learner_id?: string | null
          parent_id?: string | null
          priority?:
            | Database["public"]["Enums"]["communication_priority"]
            | null
          read_at?: string | null
          sender_id?: string | null
          subject: string
          type: Database["public"]["Enums"]["communication_type"]
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string | null
          id?: string
          institution_id?: string
          learner_id?: string | null
          parent_id?: string | null
          priority?:
            | Database["public"]["Enums"]["communication_priority"]
            | null
          read_at?: string | null
          sender_id?: string | null
          subject?: string
          type?: Database["public"]["Enums"]["communication_type"]
        }
        Relationships: [
          {
            foreignKeyName: "parent_communications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_communications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "parent_communications_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_communications_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "parent_communications_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
          },
          {
            foreignKeyName: "parent_communications_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_learner_links: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          learner_id: string
          parent_id: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          learner_id: string
          parent_id: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          learner_id?: string
          parent_id?: string
          relationship?: Database["public"]["Enums"]["parent_relationship"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_learner_links_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_learner_links_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "parent_learner_links_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
          },
          {
            foreignKeyName: "parent_learner_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_otp_requests: {
        Row: {
          attempts: number | null
          created_at: string | null
          expires_at: string
          id: string
          institution_id: string
          otp_code: string
          phone: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          institution_id: string
          otp_code: string
          phone: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          institution_id?: string
          otp_code?: string
          phone?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_otp_requests_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_otp_requests_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      parent_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          institution_id: string
          is_verified: boolean | null
          last_login_at: string | null
          name: string
          phone: string | null
          relationship:
            | Database["public"]["Enums"]["parent_relationship"]
            | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          institution_id: string
          is_verified?: boolean | null
          last_login_at?: string | null
          name: string
          phone?: string | null
          relationship?:
            | Database["public"]["Enums"]["parent_relationship"]
            | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          institution_id?: string
          is_verified?: boolean | null
          last_login_at?: string | null
          name?: string
          phone?: string | null
          relationship?:
            | Database["public"]["Enums"]["parent_relationship"]
            | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
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
      process_audits: {
        Row: {
          abcd_rating: string | null
          audit_period_end: string
          audit_period_start: string
          auditor_id: string | null
          avg_cycle_hours: number | null
          avg_value_add_ratio: number | null
          created_at: string | null
          finalized_at: string | null
          findings: string | null
          id: string
          institution_id: string
          process_id: string
          recommendations: string | null
          sla_compliance_rate: number | null
          status: string | null
          total_instances: number | null
          waste_breakdown: Json | null
        }
        Insert: {
          abcd_rating?: string | null
          audit_period_end: string
          audit_period_start: string
          auditor_id?: string | null
          avg_cycle_hours?: number | null
          avg_value_add_ratio?: number | null
          created_at?: string | null
          finalized_at?: string | null
          findings?: string | null
          id?: string
          institution_id: string
          process_id: string
          recommendations?: string | null
          sla_compliance_rate?: number | null
          status?: string | null
          total_instances?: number | null
          waste_breakdown?: Json | null
        }
        Update: {
          abcd_rating?: string | null
          audit_period_end?: string
          audit_period_start?: string
          auditor_id?: string | null
          avg_cycle_hours?: number | null
          avg_value_add_ratio?: number | null
          created_at?: string | null
          finalized_at?: string | null
          findings?: string | null
          id?: string
          institution_id?: string
          process_id?: string
          recommendations?: string | null
          sla_compliance_rate?: number | null
          status?: string | null
          total_instances?: number | null
          waste_breakdown?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "process_audits_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_audits_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "process_audits_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      process_definitions: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          name: string
          sla_hours: number | null
          stages: Json
          target_cycle_time_hours: number | null
          target_value_add_ratio: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          name: string
          sla_hours?: number | null
          stages?: Json
          target_cycle_time_hours?: number | null
          target_value_add_ratio?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          name?: string
          sla_hours?: number | null
          stages?: Json
          target_cycle_time_hours?: number | null
          target_value_add_ratio?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_definitions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_definitions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      process_instances: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_stage: string | null
          id: string
          process_id: string
          reference_id: string
          reference_type: string
          sla_status: string | null
          stage_history: Json | null
          started_at: string
          total_cycle_hours: number | null
          value_add_hours: number | null
          value_add_ratio: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: string | null
          id?: string
          process_id: string
          reference_id: string
          reference_type: string
          sla_status?: string | null
          stage_history?: Json | null
          started_at?: string
          total_cycle_hours?: number | null
          value_add_hours?: number | null
          value_add_ratio?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: string | null
          id?: string
          process_id?: string
          reference_id?: string
          reference_type?: string
          sla_status?: string | null
          stage_history?: Json | null
          started_at?: string
          total_cycle_hours?: number | null
          value_add_hours?: number | null
          value_add_ratio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "process_instances_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_definitions"
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
            foreignKeyName: "fk_profiles_department_id"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
          {
            foreignKeyName: "profiles_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
          duration_years: number | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          is_part_time: boolean | null
          pattern_type: string | null
          program_code: string | null
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
          duration_years?: number | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_part_time?: boolean | null
          pattern_type?: string | null
          program_code?: string | null
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
          duration_years?: number | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_part_time?: boolean | null
          pattern_type?: string | null
          program_code?: string | null
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
            foreignKeyName: "programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      re_engagement_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          exclude_if_active_in_days: number | null
          id: string
          institution_id: string
          leads_converted: number | null
          leads_re_engaged: number | null
          max_leads_per_day: number | null
          name: string
          send_time: string | null
          send_timezone: string | null
          sequence: Json
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          target_criteria: Json
          total_leads_targeted: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          exclude_if_active_in_days?: number | null
          id?: string
          institution_id: string
          leads_converted?: number | null
          leads_re_engaged?: number | null
          max_leads_per_day?: number | null
          name: string
          send_time?: string | null
          send_timezone?: string | null
          sequence?: Json
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          target_criteria: Json
          total_leads_targeted?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          exclude_if_active_in_days?: number | null
          id?: string
          institution_id?: string
          leads_converted?: number | null
          leads_re_engaged?: number | null
          max_leads_per_day?: number | null
          name?: string
          send_time?: string | null
          send_timezone?: string | null
          sequence?: Json
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          target_criteria?: Json
          total_leads_targeted?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "re_engagement_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "re_engagement_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "re_engagement_campaigns_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "re_engagement_campaigns_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      referral_reward_configs: {
        Row: {
          applicable_degrees: string[] | null
          applicable_programs: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          max_referrals_per_year: number | null
          max_reward_amount: number | null
          max_stacking_count: number | null
          min_referrals_required: number | null
          min_reward_amount: number | null
          name: string
          referrer_type: string
          reward_type: string
          reward_value: number
          reward_value_type: string
          stackable: boolean | null
          trigger_conditions: Json | null
          trigger_stage: string
          updated_at: string | null
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          applicable_degrees?: string[] | null
          applicable_programs?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          max_referrals_per_year?: number | null
          max_reward_amount?: number | null
          max_stacking_count?: number | null
          min_referrals_required?: number | null
          min_reward_amount?: number | null
          name: string
          referrer_type: string
          reward_type: string
          reward_value: number
          reward_value_type: string
          stackable?: boolean | null
          trigger_conditions?: Json | null
          trigger_stage?: string
          updated_at?: string | null
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          applicable_degrees?: string[] | null
          applicable_programs?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          max_referrals_per_year?: number | null
          max_reward_amount?: number | null
          max_stacking_count?: number | null
          min_referrals_required?: number | null
          min_reward_amount?: number | null
          name?: string
          referrer_type?: string
          reward_type?: string
          reward_value?: number
          reward_value_type?: string
          stackable?: boolean | null
          trigger_conditions?: Json | null
          trigger_stage?: string
          updated_at?: string | null
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          applied_to_bill_id: string | null
          approved_at: string | null
          approved_by: string | null
          attribution_id: string | null
          created_at: string | null
          credits_awarded: number | null
          credits_balance: number | null
          credits_expiry_date: string | null
          credits_used: number | null
          discount_applied_at: string | null
          id: string
          institution_id: string
          notes: string | null
          paid_at: string | null
          payment_mode: string | null
          payment_reference: string | null
          referred_learner_id: string
          referrer_consultant_id: string | null
          referrer_learner_id: string
          rejection_reason: string | null
          reward_amount: number
          reward_config_id: string | null
          reward_description: string | null
          reward_number: string | null
          reward_type: string
          status: string | null
          status_history: Json | null
          updated_at: string | null
        }
        Insert: {
          applied_to_bill_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attribution_id?: string | null
          created_at?: string | null
          credits_awarded?: number | null
          credits_balance?: number | null
          credits_expiry_date?: string | null
          credits_used?: number | null
          discount_applied_at?: string | null
          id?: string
          institution_id: string
          notes?: string | null
          paid_at?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          referred_learner_id: string
          referrer_consultant_id?: string | null
          referrer_learner_id: string
          rejection_reason?: string | null
          reward_amount: number
          reward_config_id?: string | null
          reward_description?: string | null
          reward_number?: string | null
          reward_type: string
          status?: string | null
          status_history?: Json | null
          updated_at?: string | null
        }
        Update: {
          applied_to_bill_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attribution_id?: string | null
          created_at?: string | null
          credits_awarded?: number | null
          credits_balance?: number | null
          credits_expiry_date?: string | null
          credits_used?: number | null
          discount_applied_at?: string | null
          id?: string
          institution_id?: string
          notes?: string | null
          paid_at?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          referred_learner_id?: string
          referrer_consultant_id?: string | null
          referrer_learner_id?: string
          rejection_reason?: string | null
          reward_amount?: number
          reward_config_id?: string | null
          reward_description?: string | null
          reward_number?: string | null
          reward_type?: string
          status?: string | null
          status_history?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "consultant_lead_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_consultant_id_fkey"
            columns: ["referrer_consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_consultant_id_fkey"
            columns: ["referrer_consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_reward_config_id_fkey"
            columns: ["reward_config_id"]
            isOneToOne: false
            referencedRelation: "referral_reward_configs"
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
      rejection_feedback: {
        Row: {
          application_id: string
          collected_at: string | null
          collected_by: string | null
          collected_via: string
          competitor_name: string | null
          competitor_program: string | null
          created_at: string | null
          expected_fee: number | null
          feedback_text: string | null
          follow_up_action: string | null
          follow_up_at: string | null
          follow_up_by: string | null
          id: string
          improvement_suggestions: string | null
          institution_id: string
          loan_needed: boolean | null
          offer_id: string | null
          primary_reason: string
          scholarship_expected: boolean | null
          sentiment: string | null
          sub_reasons: string[] | null
          would_recommend: boolean | null
        }
        Insert: {
          application_id: string
          collected_at?: string | null
          collected_by?: string | null
          collected_via: string
          competitor_name?: string | null
          competitor_program?: string | null
          created_at?: string | null
          expected_fee?: number | null
          feedback_text?: string | null
          follow_up_action?: string | null
          follow_up_at?: string | null
          follow_up_by?: string | null
          id?: string
          improvement_suggestions?: string | null
          institution_id: string
          loan_needed?: boolean | null
          offer_id?: string | null
          primary_reason: string
          scholarship_expected?: boolean | null
          sentiment?: string | null
          sub_reasons?: string[] | null
          would_recommend?: boolean | null
        }
        Update: {
          application_id?: string
          collected_at?: string | null
          collected_by?: string | null
          collected_via?: string
          competitor_name?: string | null
          competitor_program?: string | null
          created_at?: string | null
          expected_fee?: number | null
          feedback_text?: string | null
          follow_up_action?: string | null
          follow_up_at?: string | null
          follow_up_by?: string | null
          id?: string
          improvement_suggestions?: string | null
          institution_id?: string
          loan_needed?: boolean | null
          offer_id?: string | null
          primary_reason?: string
          scholarship_expected?: boolean | null
          sentiment?: string | null
          sub_reasons?: string[] | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rejection_feedback_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_feedback_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_feedback_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rejection_feedback_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_feedback_follow_up_by_fkey"
            columns: ["follow_up_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rejection_feedback_follow_up_by_fkey"
            columns: ["follow_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_feedback_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_feedback_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "rejection_feedback_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offer_letters"
            referencedColumns: ["id"]
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
            foreignKeyName: "resources_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      scholarship_applications: {
        Row: {
          application_id: string
          applied_at: string | null
          approved_amount: number | null
          documents: string[] | null
          id: string
          institution_id: string
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scholarship_id: string
          status: string | null
          supporting_data: Json | null
          updated_at: string | null
        }
        Insert: {
          application_id: string
          applied_at?: string | null
          approved_amount?: number | null
          documents?: string[] | null
          id?: string
          institution_id: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scholarship_id: string
          status?: string | null
          supporting_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          application_id?: string
          applied_at?: string | null
          approved_amount?: number | null
          documents?: string[] | null
          id?: string
          institution_id?: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scholarship_id?: string
          status?: string | null
          supporting_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scholarship_applications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "scholarship_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "scholarship_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_scholarship_id_fkey"
            columns: ["scholarship_id"]
            isOneToOne: false
            referencedRelation: "scholarships"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarships: {
        Row: {
          academic_year: string | null
          auto_qualify: boolean | null
          benefit_type: string
          benefit_value: number
          code: string
          created_at: string | null
          description: string | null
          eligibility_criteria: Json
          id: string
          institution_id: string
          is_active: boolean | null
          max_benefit: number | null
          name: string
          requires_application: boolean | null
          scholarship_type: Database["public"]["Enums"]["scholarship_type"]
          total_slots: number | null
          updated_at: string | null
          used_slots: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          academic_year?: string | null
          auto_qualify?: boolean | null
          benefit_type: string
          benefit_value: number
          code: string
          created_at?: string | null
          description?: string | null
          eligibility_criteria?: Json
          id?: string
          institution_id: string
          is_active?: boolean | null
          max_benefit?: number | null
          name: string
          requires_application?: boolean | null
          scholarship_type: Database["public"]["Enums"]["scholarship_type"]
          total_slots?: number | null
          updated_at?: string | null
          used_slots?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          academic_year?: string | null
          auto_qualify?: boolean | null
          benefit_type?: string
          benefit_value?: number
          code?: string
          created_at?: string | null
          description?: string | null
          eligibility_criteria?: Json
          id?: string
          institution_id?: string
          is_active?: boolean | null
          max_benefit?: number | null
          name?: string
          requires_application?: boolean | null
          scholarship_type?: Database["public"]["Enums"]["scholarship_type"]
          total_slots?: number | null
          updated_at?: string | null
          used_slots?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scholarships_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          institution_id: string | null
          is_active: boolean | null
          is_positive: boolean | null
          priority: number | null
          score_value: number
          signal_category: string
          signal_name: string
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_positive?: boolean | null
          priority?: number | null
          score_value: number
          signal_category: string
          signal_name: string
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          institution_id?: string | null
          is_active?: boolean | null
          is_positive?: boolean | null
          priority?: number | null
          score_value?: number
          signal_category?: string
          signal_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "scoring_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      screening_exams: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string | null
          cutoff_met: boolean | null
          cutoff_score: number | null
          duration_minutes: number | null
          exam_name: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          external_exam_name: string | null
          external_roll_number: string | null
          external_score_verified: boolean | null
          id: string
          institution_id: string
          max_score: number | null
          percentage: number | null
          percentile: number | null
          raw_score: number | null
          scheduled_at: string | null
          score_breakdown: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["exam_status"] | null
          suggested_programs: string[] | null
          updated_at: string | null
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string | null
          cutoff_met?: boolean | null
          cutoff_score?: number | null
          duration_minutes?: number | null
          exam_name?: string | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          external_exam_name?: string | null
          external_roll_number?: string | null
          external_score_verified?: boolean | null
          id?: string
          institution_id: string
          max_score?: number | null
          percentage?: number | null
          percentile?: number | null
          raw_score?: number | null
          scheduled_at?: string | null
          score_breakdown?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"] | null
          suggested_programs?: string[] | null
          updated_at?: string | null
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string | null
          cutoff_met?: boolean | null
          cutoff_score?: number | null
          duration_minutes?: number | null
          exam_name?: string | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          external_exam_name?: string | null
          external_roll_number?: string | null
          external_score_verified?: boolean | null
          id?: string
          institution_id?: string
          max_score?: number | null
          percentage?: number | null
          percentile?: number | null
          raw_score?: number | null
          scheduled_at?: string | null
          score_breakdown?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"] | null
          suggested_programs?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_exams_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_exams_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_exams_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_exams_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
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
            foreignKeyName: "sections_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
            foreignKeyName: "semesters_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      sla_configurations: {
        Row: {
          applies_to: string
          business_end_hour: number | null
          business_hours_only: boolean | null
          business_start_hour: number | null
          created_at: string | null
          critical_time_minutes: number
          description: string | null
          escalation_rule_id: string | null
          excluded_days: number[] | null
          id: string
          institution_id: string
          is_active: boolean | null
          name: string
          notify_on_critical: boolean | null
          notify_on_warning: boolean | null
          target_time_minutes: number
          updated_at: string | null
          warning_time_minutes: number
        }
        Insert: {
          applies_to: string
          business_end_hour?: number | null
          business_hours_only?: boolean | null
          business_start_hour?: number | null
          created_at?: string | null
          critical_time_minutes: number
          description?: string | null
          escalation_rule_id?: string | null
          excluded_days?: number[] | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          name: string
          notify_on_critical?: boolean | null
          notify_on_warning?: boolean | null
          target_time_minutes: number
          updated_at?: string | null
          warning_time_minutes: number
        }
        Update: {
          applies_to?: string
          business_end_hour?: number | null
          business_hours_only?: boolean | null
          business_start_hour?: number | null
          created_at?: string | null
          critical_time_minutes?: number
          description?: string | null
          escalation_rule_id?: string | null
          excluded_days?: number[] | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          name?: string
          notify_on_critical?: boolean | null
          notify_on_warning?: boolean | null
          target_time_minutes?: number
          updated_at?: string | null
          warning_time_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_configurations_escalation_rule_id_fkey"
            columns: ["escalation_rule_id"]
            isOneToOne: false
            referencedRelation: "escalation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_configurations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_configurations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          auth_user_id: string | null
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
          full_name: string | null
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
          auth_user_id?: string | null
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
          full_name?: string | null
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
          auth_user_id?: string | null
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
          full_name?: string | null
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
            foreignKeyName: "staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
            foreignKeyName: "staff_plans_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
            foreignKeyName: "fk_student_attendance_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      students: {
        Row: {
          address: Json | null
          blood_group: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact: Json | null
          first_name: string | null
          gender: string | null
          id: string
          institution_id: string | null
          last_name: string | null
          learner_profile_id: string | null
          phone: string | null
          status: string | null
          student_id: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string | null
          gender?: string | null
          id?: string
          institution_id?: string | null
          last_name?: string | null
          learner_profile_id?: string | null
          phone?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string | null
          gender?: string | null
          id?: string
          institution_id?: string | null
          last_name?: string | null
          learner_profile_id?: string | null
          phone?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "students_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "learners_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "semester_program_audit_view"
            referencedColumns: ["learner_id"]
          },
          {
            foreignKeyName: "students_learner_profile_id_fkey"
            columns: ["learner_profile_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
            foreignKeyName: "timetables_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      waste_incidents: {
        Row: {
          corrective_action: string | null
          description: string
          estimated_cost_impact: number | null
          estimated_time_lost_hours: number | null
          id: string
          institution_id: string
          process_id: string | null
          process_instance_id: string | null
          reported_at: string | null
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          root_cause: string | null
          status: string | null
          waste_category: string
        }
        Insert: {
          corrective_action?: string | null
          description: string
          estimated_cost_impact?: number | null
          estimated_time_lost_hours?: number | null
          id?: string
          institution_id: string
          process_id?: string | null
          process_instance_id?: string | null
          reported_at?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          root_cause?: string | null
          status?: string | null
          waste_category: string
        }
        Update: {
          corrective_action?: string | null
          description?: string
          estimated_cost_impact?: number | null
          estimated_time_lost_hours?: number | null
          id?: string
          institution_id?: string
          process_id?: string | null
          process_instance_id?: string | null
          reported_at?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          root_cause?: string | null
          status?: string | null
          waste_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "waste_incidents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_incidents_process_instance_id_fkey"
            columns: ["process_instance_id"]
            isOneToOne: false
            referencedRelation: "process_instances"
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
      whatsapp_connections: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          error_message: string | null
          id: string
          institution_id: string
          jid: string | null
          last_health_check: string | null
          last_qr_at: string | null
          phone_number: string | null
          push_name: string | null
          service_url: string | null
          session_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          error_message?: string | null
          id?: string
          institution_id: string
          jid?: string | null
          last_health_check?: string | null
          last_qr_at?: string | null
          phone_number?: string | null
          push_name?: string | null
          service_url?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          error_message?: string | null
          id?: string
          institution_id?: string
          jid?: string | null
          last_health_check?: string | null
          last_qr_at?: string | null
          phone_number?: string | null
          push_name?: string | null
          service_url?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      whatsapp_message_logs: {
        Row: {
          connection_id: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          institution_id: string
          message_preview: string | null
          message_type: string
          read_at: string | null
          recipient_count: number | null
          recipient_jid: string
          recipient_name: string | null
          recipient_type: string
          sent_at: string
          sent_by: string
          status: string
          template_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          institution_id: string
          message_preview?: string | null
          message_type?: string
          read_at?: string | null
          recipient_count?: number | null
          recipient_jid: string
          recipient_name?: string | null
          recipient_type: string
          sent_at?: string
          sent_by: string
          status?: string
          template_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          institution_id?: string
          message_preview?: string | null
          message_type?: string
          read_at?: string | null
          recipient_count?: number | null
          recipient_jid?: string
          recipient_name?: string | null
          recipient_type?: string
          sent_at?: string
          sent_by?: string
          status?: string
          template_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_active_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_settings: {
        Row: {
          api_key: string | null
          bulk_delay_ms: number | null
          created_at: string
          enable_auto_replies: boolean | null
          enable_bulk_messaging: boolean | null
          enable_scheduled_messages: boolean | null
          enable_templates: boolean | null
          id: string
          institution_id: string
          max_bulk_recipients: number | null
          message_log_retention_days: number | null
          messages_per_minute: number | null
          notify_email: string | null
          notify_on_disconnect: boolean | null
          service_url: string | null
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          bulk_delay_ms?: number | null
          created_at?: string
          enable_auto_replies?: boolean | null
          enable_bulk_messaging?: boolean | null
          enable_scheduled_messages?: boolean | null
          enable_templates?: boolean | null
          id?: string
          institution_id: string
          max_bulk_recipients?: number | null
          message_log_retention_days?: number | null
          messages_per_minute?: number | null
          notify_email?: string | null
          notify_on_disconnect?: boolean | null
          service_url?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          bulk_delay_ms?: number | null
          created_at?: string
          enable_auto_replies?: boolean | null
          enable_bulk_messaging?: boolean | null
          enable_scheduled_messages?: boolean | null
          enable_templates?: boolean | null
          id?: string
          institution_id?: string
          max_bulk_recipients?: number | null
          message_log_retention_days?: number | null
          messages_per_minute?: number | null
          notify_email?: string | null
          notify_on_disconnect?: boolean | null
          service_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_settings_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      whatsapp_shared_access: {
        Row: {
          access_level: string
          connection_id: string
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          profile_id: string
        }
        Insert: {
          access_level?: string
          connection_id: string
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          profile_id: string
        }
        Update: {
          access_level?: string
          connection_id?: string
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_shared_access_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_active_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_shared_access_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_shared_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_shared_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_shared_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_shared_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          institution_id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          updated_at: string
          use_count: number | null
          variables: Json | null
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          updated_at?: string
          use_count?: number | null
          variables?: Json | null
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          updated_at?: string
          use_count?: number | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          error_message: string | null
          id: string
          institution_id: string
          lead_id: string | null
          next_step_at: string | null
          results: Json | null
          retry_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_status"] | null
          total_steps: number
          trigger_data: Json | null
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error_message?: string | null
          id?: string
          institution_id: string
          lead_id?: string | null
          next_step_at?: string | null
          results?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          total_steps: number
          trigger_data?: Json | null
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error_message?: string | null
          id?: string
          institution_id?: string
          lead_id?: string | null
          next_step_at?: string | null
          results?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          total_steps?: number
          trigger_data?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "workflow_executions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step_logs: {
        Row: {
          completed_at: string | null
          created_message_id: string | null
          created_task_id: string | null
          error_message: string | null
          execution_id: string
          id: string
          result: Json | null
          started_at: string | null
          status: string | null
          step_action: string
          step_config: Json
          step_number: number
        }
        Insert: {
          completed_at?: string | null
          created_message_id?: string | null
          created_task_id?: string | null
          error_message?: string | null
          execution_id: string
          id?: string
          result?: Json | null
          started_at?: string | null
          status?: string | null
          step_action: string
          step_config: Json
          step_number: number
        }
        Update: {
          completed_at?: string | null
          created_message_id?: string | null
          created_task_id?: string | null
          error_message?: string | null
          execution_id?: string
          id?: string
          result?: Json | null
          started_at?: string | null
          status?: string | null
          step_action?: string
          step_config?: Json
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          failed_executions: number | null
          id: string
          institution_id: string
          is_active: boolean | null
          is_system: boolean | null
          max_concurrent: number | null
          name: string
          retry_count: number | null
          retry_delay_minutes: number | null
          schedule_cron: string | null
          schedule_timezone: string | null
          steps: Json
          successful_executions: number | null
          total_executions: number | null
          trigger_conditions: Json | null
          trigger_event: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          failed_executions?: number | null
          id?: string
          institution_id: string
          is_active?: boolean | null
          is_system?: boolean | null
          max_concurrent?: number | null
          name: string
          retry_count?: number | null
          retry_delay_minutes?: number | null
          schedule_cron?: string | null
          schedule_timezone?: string | null
          steps?: Json
          successful_executions?: number | null
          total_executions?: number | null
          trigger_conditions?: Json | null
          trigger_event: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          failed_executions?: number | null
          id?: string
          institution_id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          max_concurrent?: number | null
          name?: string
          retry_count?: number | null
          retry_delay_minutes?: number | null
          schedule_cron?: string | null
          schedule_timezone?: string | null
          steps?: Json
          successful_executions?: number | null
          total_executions?: number | null
          trigger_conditions?: Json | null
          trigger_event?: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
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
      billing_copq_summary: {
        Row: {
          avg_time_spent: number | null
          category: string | null
          incident_count: number | null
          institution_id: string | null
          month: string | null
          total_copq: number | null
          total_hidden_cost: number | null
          total_visible_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_copq_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      billing_copq_yearly_totals: {
        Row: {
          avg_affected_stakeholders: number | null
          avg_time_spent_hours: number | null
          institution_id: string | null
          open_incidents: number | null
          resolved_incidents: number | null
          total_copq: number | null
          total_hidden_cost: number | null
          total_incidents: number | null
          total_visible_cost: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_copq_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_copq_incidents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
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
          {
            foreignKeyName: "fk_billing_student_bills_learner_profile"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_pending_escalations"
            referencedColumns: ["learner_profile_id"]
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
            foreignKeyName: "bug_reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
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
      contact_phone_lookup: {
        Row: {
          contact_type: string | null
          department_id: string | null
          email: string | null
          institution_id: string | null
          name: string | null
          phone_number: string | null
          record_id: string | null
          source_table: string | null
        }
        Relationships: []
      }
      hostel_active_allocations: {
        Row: {
          academic_year: string | null
          allocation_id: string | null
          allocation_status: string | null
          bed_id: string | null
          bed_number: string | null
          checked_in_at: string | null
          end_date: string | null
          floor_number: number | null
          has_ac: boolean | null
          hostel_code: string | null
          hostel_id: string | null
          hostel_name: string | null
          hostel_type: string | null
          institution_id: string | null
          room_id: string | null
          room_number: string | null
          room_type: string | null
          semester: string | null
          start_date: string | null
          student_id: string | null
          student_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_allocations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      hostel_occupancy_summary: {
        Row: {
          available_beds: number | null
          hostel_code: string | null
          hostel_id: string | null
          hostel_name: string | null
          hostel_type: string | null
          institution_id: string | null
          maintenance_beds: number | null
          occupancy_rate: number | null
          occupied_beds: number | null
          reserved_beds: number | null
          total_beds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hostels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      hostel_room_availability: {
        Row: {
          available_beds: number | null
          floor_id: string | null
          floor_name: string | null
          floor_number: number | null
          has_ac: boolean | null
          has_attached_bathroom: boolean | null
          hostel_id: string | null
          hostel_name: string | null
          hostel_type: string | null
          occupied_beds: number | null
          room_id: string | null
          room_number: string | null
          room_status: string | null
          room_type: string | null
          total_beds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "hostel_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_active_allocations"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_occupancy_summary"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
      lateral_entry_applications_view: {
        Row: {
          academic_score: number | null
          admission_id: string | null
          application_number: string | null
          application_status: string | null
          application_type: string | null
          applied_program_id: string | null
          applied_program_name: string | null
          approval_notes: string | null
          cgpa: number | null
          created_at: string | null
          current_institution: string | null
          current_program: string | null
          current_year: string | null
          date_of_birth: string | null
          document_count: number | null
          documents: Json | null
          documents_uploaded: boolean | null
          eligibility_notes: string | null
          eligibility_status: string | null
          email: string | null
          id: string | null
          institution_code: string | null
          institution_id: string | null
          institution_name: string | null
          ip_address: unknown
          phone: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_name: string | null
          source: string | null
          student_id: string | null
          student_name: string | null
          target_program_code: string | null
          target_program_name_full: string | null
          target_year: number | null
          updated_at: string | null
          user_agent: string | null
          verified_document_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lateral_entry_applications_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_applied_program_id_fkey"
            columns: ["applied_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lateral_entry_vacancy_summary: {
        Row: {
          academic_year: string | null
          available_lateral: number | null
          available_regular: number | null
          closes_at: string | null
          created_at: string | null
          duration_years: number | null
          fill_percentage: number | null
          id: string | null
          institution_code: string | null
          institution_id: string | null
          institution_name: string | null
          is_open: boolean | null
          lateral_entry_seats: number | null
          lateral_filled: number | null
          notes: string | null
          opens_at: string | null
          program_code: string | null
          program_id: string | null
          program_name: string | null
          regular_filled: number | null
          regular_seats: number | null
          semester: string | null
          total_intake: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lateral_entry_vacancies_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lateral_entry_vacancies_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "lateral_entry_vacancies_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      maturity_dashboard_summary: {
        Row: {
          assessment_date: string | null
          assessment_id: string | null
          completed_actions: number | null
          department_id: string | null
          department_name: string | null
          dimension_scores: Json | null
          institution_id: string | null
          institution_name: string | null
          overall_stage: number | null
          overdue_actions: number | null
          status: string | null
          target_date: string | null
          target_stage: number | null
          total_actions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maturity_assessments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturity_assessments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      okr_abcd_analysis: {
        Row: {
          abcd_category: string | null
          analysis: string | null
          created_at: string | null
          deadline: string | null
          department_id: string | null
          institution_id: string | null
          key_result_id: string | null
          key_result_title: string | null
          objective_id: string | null
          objective_status: string | null
          objective_title: string | null
          owner_id: string | null
          owner_type: string | null
          priority_order: number | null
          process_notes: string | null
          process_rating: number | null
          progress: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "okr_objectives_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "maturity_dashboard_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "okr_objectives_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_objectives_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "okr_objectives_owner_profile_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_objectives_owner_profile_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      v_admission_funnel: {
        Row: {
          avg_days_in_stage: number | null
          avg_score: number | null
          count: number | null
          institution_id: string | null
          stage: Database["public"]["Enums"]["admission_lead_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_application_summary: {
        Row: {
          academic_year: string | null
          application_number: string | null
          completion_percentage: number | null
          created_at: string | null
          id: string | null
          institution_id: string | null
          interview_outcome:
            | Database["public"]["Enums"]["interview_outcome"]
            | null
          interview_status:
            | Database["public"]["Enums"]["interview_status"]
            | null
          lead_id: string | null
          lead_score: number | null
          offer_response: Database["public"]["Enums"]["offer_response"] | null
          pending_amount: number | null
          program_id: string | null
          rejected_documents: number | null
          status: Database["public"]["Enums"]["application_status"] | null
          submitted_at: string | null
          total_documents: number | null
          total_paid: number | null
          updated_at: string | null
          verified_documents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "admission_applications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      v_commission_liability: {
        Row: {
          approved_amount: number | null
          approved_count: number | null
          consultant_id: string | null
          institution_id: string | null
          paid_amount: number | null
          pending_amount: number | null
          pending_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_commission_transactions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_commission_transactions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      v_consultant_lead_pipeline: {
        Row: {
          consultant_id: string | null
          consultant_name: string | null
          current_stage: string | null
          institution_id: string | null
          lead_count: number | null
          month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_lead_attributions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "education_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_lead_attributions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "v_consultant_performance"
            referencedColumns: ["id"]
          },
        ]
      }
      v_consultant_performance: {
        Row: {
          code: string | null
          consultant_type: string | null
          contract_end_date: string | null
          contract_status: string | null
          contract_validity_status: string | null
          conversion_rate: number | null
          conversions_this_month: number | null
          id: string | null
          institution_id: string | null
          leads_this_month: number | null
          name: string | null
          pending_commission: number | null
          performance_rating: number | null
          relationship_score: number | null
          status: string | null
          total_commission_earned: number | null
          total_commission_paid: number | null
          total_conversions: number | null
          total_leads_referred: number | null
        }
        Insert: {
          code?: string | null
          consultant_type?: string | null
          contract_end_date?: string | null
          contract_status?: string | null
          contract_validity_status?: never
          conversion_rate?: number | null
          conversions_this_month?: never
          id?: string | null
          institution_id?: string | null
          leads_this_month?: never
          name?: string | null
          pending_commission?: number | null
          performance_rating?: number | null
          relationship_score?: number | null
          status?: string | null
          total_commission_earned?: number | null
          total_commission_paid?: number | null
          total_conversions?: number | null
          total_leads_referred?: number | null
        }
        Update: {
          code?: string | null
          consultant_type?: string | null
          contract_end_date?: string | null
          contract_status?: string | null
          contract_validity_status?: never
          conversion_rate?: number | null
          conversions_this_month?: never
          id?: string | null
          institution_id?: string | null
          leads_this_month?: never
          name?: string | null
          pending_commission?: number | null
          performance_rating?: number | null
          relationship_score?: number | null
          status?: string | null
          total_commission_earned?: number | null
          total_commission_paid?: number | null
          total_conversions?: number | null
          total_leads_referred?: number | null
        }
        Relationships: []
      }
      v_counselor_leaderboard: {
        Row: {
          avatar_url: string | null
          avg_response_time: number | null
          conversion_change: number | null
          conversion_rate: number | null
          counselor_id: string | null
          counselor_name: string | null
          institution_id: string | null
          performance_score: number | null
          rank: number | null
          total_assigned: number | null
          total_calls: number | null
          total_contacted: number | null
          total_converted: number | null
          total_emails: number | null
          total_progressions: number | null
          total_tasks_completed: number | null
          total_whatsapp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_daily_metrics_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_counselor_performance: {
        Row: {
          avg_lead_score: number | null
          contacted_24h: number | null
          conversion_rate: number | null
          counselor_id: string | null
          counselor_name: string | null
          enrolled_count: number | null
          institution_id: string | null
          total_leads: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_assigned_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_leads_assigned_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_counselor_performance_trends: {
        Row: {
          avg_response_time_seconds: number | null
          calls_made: number | null
          counselor_id: string | null
          institution_id: string | null
          leads_assigned: number | null
          leads_contacted: number | null
          leads_converted: number | null
          metric_date: string | null
          rolling_7day_calls: number | null
          rolling_7day_conversions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_daily_metrics_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_funnel_analytics: {
        Row: {
          active_count: number | null
          alert_level: string | null
          avg_days_in_stage: number | null
          institution_id: string | null
          lead_count: number | null
          percentage_of_total: number | null
          previous_week_count: number | null
          stage_name: string | null
          stage_order: number | null
          stuck_count: number | null
          wow_change_percent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_funnel_drop_off: {
        Row: {
          active_leads: number | null
          at_stage_count: number | null
          avg_days_in_stage: number | null
          conversion_rate: number | null
          drop_off_rate: number | null
          institution_id: string | null
          percentage_reached: number | null
          reached_stage_count: number | null
          stage_name: string | null
          stage_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_okr_cascade: {
        Row: {
          depth: number | null
          id: string | null
          level: string | null
          overall_progress: number | null
          owner_avatar: string | null
          owner_email: string | null
          owner_id: string | null
          owner_name: string | null
          parent_objective_id: string | null
          path: string[] | null
          tier: string | null
          title: string | null
        }
        Relationships: []
      }
      v_okr_comment_counts: {
        Row: {
          entity_id: string | null
          entity_type: string | null
          last_comment_at: string | null
          root_comments: number | null
          total_comments: number | null
        }
        Relationships: []
      }
      v_okr_reaction_counts: {
        Row: {
          count: number | null
          entity_id: string | null
          entity_type: string | null
          reaction_type: string | null
          user_ids: string[] | null
        }
        Relationships: []
      }
      v_payment_summary: {
        Row: {
          application_fee: number | null
          application_fee_paid: number | null
          application_id: string | null
          application_number: string | null
          full_fee: number | null
          full_fee_paid: number | null
          institution_id: string | null
          token_fee: number | null
          token_fee_paid: number | null
          total_due: number | null
          total_paid: number | null
          total_pending: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "admission_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_escalations: {
        Row: {
          created_at: string | null
          escalated_from: string | null
          escalated_from_name: string | null
          escalated_to: string | null
          escalated_to_name: string | null
          hours_since_escalation: number | null
          id: string | null
          institution_id: string | null
          lead_id: string | null
          lead_name: string | null
          lead_phone: string | null
          learner_profile_id: string | null
          rule_name: string | null
          status: Database["public"]["Enums"]["escalation_status"] | null
          trigger_data: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_log_escalated_from_fkey"
            columns: ["escalated_from"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_from_fkey"
            columns: ["escalated_from"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_log_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "escalation_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_leads"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      v_pending_verifications: {
        Row: {
          application_id: string | null
          application_number: string | null
          document_id: string | null
          document_type: string | null
          file_name: string | null
          hours_pending: number | null
          institution_id: string | null
          uploaded_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "v_application_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      v_source_performance: {
        Row: {
          avg_score: number | null
          conversion_rate: number | null
          enrolled_count: number | null
          institution_id: string | null
          lead_count: number | null
          source_name: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_stuck_leads: {
        Row: {
          assigned_counselor_id: string | null
          combined_score: number | null
          counselor_name: string | null
          current_stage: string | null
          days_in_stage: number | null
          engagement_score: number | null
          institution_id: string | null
          is_hot_lead: boolean | null
          last_activity_at: string | null
          last_contact_at: string | null
          lead_id: string | null
          quality_score: number | null
          suggested_action: string | null
          urgency_level: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_assigned_counselor_id_fkey"
            columns: ["assigned_counselor_id"]
            isOneToOne: false
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admission_leads_assigned_counselor_id_fkey"
            columns: ["assigned_counselor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_team_okr_summary: {
        Row: {
          at_risk_count: number | null
          behind_count: number | null
          blocked_count: number | null
          manager_id: string | null
          on_track_count: number | null
          overdue_checkins: number | null
          total_objectives: number | null
        }
        Relationships: [
          {
            foreignKeyName: "okr_user_status_user_profile_fkey"
            columns: ["manager_id"]
            isOneToOne: true
            referencedRelation: "bug_reporters_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "okr_user_status_user_profile_fkey"
            columns: ["manager_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_team_performance_summary: {
        Row: {
          avg_team_response_time: number | null
          institution_id: string | null
          team_conversion_rate: number | null
          total_calls: number | null
          total_counselors: number | null
          total_leads_assigned: number | null
          total_leads_contacted: number | null
          total_leads_converted: number | null
          total_tasks_completed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counselor_daily_metrics_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      v_workflow_stats: {
        Row: {
          created_at: string | null
          failed_executions: number | null
          id: string | null
          institution_id: string | null
          is_active: boolean | null
          name: string | null
          running_count: number | null
          success_rate: number | null
          successful_executions: number | null
          total_executions: number | null
          trigger_event:
            | Database["public"]["Enums"]["workflow_trigger_type"]
            | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          failed_executions?: number | null
          id?: string | null
          institution_id?: string | null
          is_active?: boolean | null
          name?: string | null
          running_count?: never
          success_rate?: never
          successful_executions?: number | null
          total_executions?: number | null
          trigger_event?:
            | Database["public"]["Enums"]["workflow_trigger_type"]
            | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          failed_executions?: number | null
          id?: string | null
          institution_id?: string | null
          is_active?: boolean | null
          name?: string | null
          running_count?: never
          success_rate?: never
          successful_executions?: number | null
          total_executions?: number | null
          trigger_event?:
            | Database["public"]["Enums"]["workflow_trigger_type"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      whatsapp_active_connections: {
        Row: {
          connected_at: string | null
          connected_by_name: string | null
          id: string | null
          institution_id: string | null
          institution_name: string | null
          jid: string | null
          last_health_check: string | null
          phone_number: string | null
          push_name: string | null
          service_url: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: true
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
      whatsapp_message_stats: {
        Row: {
          delivered_count: number | null
          failed_count: number | null
          institution_id: string | null
          read_count: number | null
          sent_count: number | null
          stat_date: string | null
          total_messages: number | null
          total_recipients: number | null
          unique_recipients: number | null
          unique_senders: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "semester_hierarchy_health"
            referencedColumns: ["institution_id"]
          },
        ]
      }
    }
    Functions: {
      add_auth_code_to_bucket: { Args: { p_code_data: Json }; Returns: Json }
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
      allocate_hostel_bed: {
        Args: {
          p_academic_year: string
          p_application_id?: string
          p_approved_by?: string
          p_bed_id: string
          p_end_date?: string
          p_institution_id: string
          p_semester: string
          p_start_date: string
          p_student_id: string
          p_student_type: string
        }
        Returns: string
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
      assign_lead_round_robin: {
        Args: { p_lead_id: string; p_rule_id: string }
        Returns: string
      }
      auto_qualify_scholarships: {
        Args: { p_application_id: string }
        Returns: number
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
      calculate_engagement_score: {
        Args: { p_lead_id: string }
        Returns: number
      }
      calculate_kr_progress: {
        Args: { current_val: number; start_val: number; target_val: number }
        Returns: number
      }
      calculate_maturity_overall_stage: {
        Args: { p_dimension_scores: Json }
        Returns: number
      }
      calculate_quality_score: { Args: { p_lead_id: string }; Returns: number }
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
      can_send_message: { Args: { p_lead_id: string }; Returns: boolean }
      can_send_whatsapp: {
        Args: { p_institution_id: string; p_user_id: string }
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
      check_escalations: { Args: { p_institution_id: string }; Returns: number }
      check_lateral_eligibility: {
        Args: { p_application_id: string }
        Returns: {
          eligibility_notes: string
          is_eligible: boolean
        }[]
      }
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
      cleanup_user_expired_sessions: {
        Args: { p_user_id: string }
        Returns: number
      }
      cleanup_whatsapp_message_logs: { Args: never; Returns: number }
      complete_workflow_step: {
        Args: {
          p_execution_id: string
          p_result?: Json
          p_status: string
          p_step_number: number
        }
        Returns: boolean
      }
      convert_to_date: { Args: { input_date: string }; Returns: string }
      create_api_key: {
        Args: { p_name: string; p_scopes: string[]; p_user_id: string }
        Returns: {
          id: string
          key_value: string
        }[]
      }
      create_default_maturity_framework: {
        Args: { p_institution_id: string }
        Returns: string
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
      execute_workflow_step: { Args: { p_execution_id: string }; Returns: Json }
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
      generate_commission_transaction_number: { Args: never; Returns: string }
      generate_consultant_code: {
        Args: { consultant_type_param: string }
        Returns: string
      }
      generate_funnel_snapshot: {
        Args: { p_institution_id: string }
        Returns: undefined
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_lateral_application_number: {
        Args: { p_application_type: string; p_institution_id: string }
        Returns: string
      }
      generate_learner_application_id: {
        Args: { institution_id_param: string }
        Returns: string
      }
      generate_payment_query_number: { Args: never; Returns: string }
      generate_payout_batch_number: { Args: never; Returns: string }
      generate_process_audit_metrics: {
        Args: {
          p_institution_id: string
          p_period_end: string
          p_period_start: string
          p_process_id: string
        }
        Returns: Json
      }
      generate_receipt_number: { Args: never; Returns: string }
      generate_referral_reward_number: { Args: never; Returns: string }
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
      get_attendance_report_list: {
        Args: {
          p_academic_year_id?: string
          p_degree_id?: string
          p_department_id?: string
          p_end_date?: string
          p_institution_id?: string
          p_limit?: number
          p_page?: number
          p_program_id?: string
          p_section_id?: string
          p_semester_id?: string
          p_sort_by?: string
          p_sort_order?: string
          p_staff_id?: string
          p_start_date?: string
        }
        Returns: {
          absent_count: number
          attendance_date: string
          attendance_percentage: number
          course_code: string
          course_name: string
          department_name: string
          end_time: string
          faculty_name: string
          id: string
          institution_name: string
          marked_at: string
          marked_by: string
          period_id: string
          period_name: string
          present_count: number
          program_name: string
          section_name: string
          semester_name: string
          start_time: string
          total_count: number
          total_students: number
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
      get_billing_copq_dashboard: {
        Args: { p_institution_id: string; p_year?: number }
        Returns: Json
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
      get_grievance_sla_stats: {
        Args: { p_institution_id: string }
        Returns: Json
      }
      get_institution_courses: {
        Args: { p_institution_id: string; p_search_term?: string }
        Returns: {
          course_code: string
          course_name: string
          id: string
        }[]
      }
      get_learner_attendance_for_parent: {
        Args: { p_days?: number; p_learner_id: string }
        Returns: Json
      }
      get_learner_fees_for_parent: {
        Args: { p_learner_id: string }
        Returns: Json
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
      get_nps_dashboard: { Args: { p_institution_id: string }; Returns: Json }
      get_okr_abcd_distribution: {
        Args: {
          p_department_id?: string
          p_institution_id?: string
          p_owner_id?: string
        }
        Returns: {
          category: string
          count: number
          percentage: number
        }[]
      }
      get_okr_d_category_alerts: {
        Args: { p_institution_id?: string }
        Returns: {
          days_until_deadline: number
          deadline: string
          key_result_id: string
          key_result_title: string
          objective_id: string
          objective_title: string
          owner_id: string
          process_notes: string
          process_rating: number
          progress: number
        }[]
      }
      get_okr_reaction_summary: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          count: number
          reaction_type: string
          user_has_reacted: boolean
        }[]
      }
      get_or_create_whatsapp_settings: {
        Args: { p_institution_id: string }
        Returns: {
          api_key: string | null
          bulk_delay_ms: number | null
          created_at: string
          enable_auto_replies: boolean | null
          enable_bulk_messaging: boolean | null
          enable_scheduled_messages: boolean | null
          enable_templates: boolean | null
          id: string
          institution_id: string
          max_bulk_recipients: number | null
          message_log_retention_days: number | null
          messages_per_minute: number | null
          notify_email: string | null
          notify_on_disconnect: boolean | null
          service_url: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_parent_dashboard: { Args: { p_parent_id: string }; Returns: Json }
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
      okr_actual_progress: { Args: { user_id_param: string }; Returns: number }
      okr_calculate_badge: { Args: { user_id_param: string }; Returns: string }
      okr_expected_progress: {
        Args: { user_id_param: string }
        Returns: number
      }
      okr_get_week_start: { Args: { check_date?: string }; Returns: string }
      okr_is_check_in_overdue: {
        Args: { user_id_param: string }
        Returns: boolean
      }
      okr_time_progress_percent: {
        Args: { end_date: string; start_date: string }
        Returns: number
      }
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
      recalculate_nps_analytics: {
        Args: { p_survey_id: string }
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
      seed_grievance_categories: {
        Args: { p_institution_id: string }
        Returns: undefined
      }
      send_parent_otp: {
        Args: { p_institution_id: string; p_phone: string }
        Returns: Json
      }
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
      toggle_okr_reaction: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_reaction_type: string
        }
        Returns: boolean
      }
      trigger_workflow: {
        Args: {
          p_lead_id: string
          p_trigger_data?: Json
          p_trigger_event: Database["public"]["Enums"]["workflow_trigger_type"]
        }
        Returns: string[]
      }
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
      update_counselor_daily_metrics: {
        Args: {
          p_counselor_id: string
          p_date?: string
          p_institution_id: string
        }
        Returns: undefined
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
      update_template_usage: {
        Args: { p_template_id: string }
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
      vacate_hostel_bed: {
        Args: {
          p_allocation_id: string
          p_vacate_note?: string
          p_vacate_reason?: string
        }
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
      verify_parent_otp: {
        Args: { p_institution_id: string; p_otp: string; p_phone: string }
        Returns: Json
      }
    }
    Enums: {
      admission_lead_stage:
        | "new"
        | "contacted"
        | "engaged"
        | "qualified"
        | "application_started"
        | "application_submitted"
        | "documents_pending"
        | "documents_verified"
        | "interview_scheduled"
        | "interview_completed"
        | "offer_sent"
        | "offer_accepted"
        | "token_paid"
        | "applied"
        | "interviewed"
        | "offered"
        | "enrolled"
        | "lost"
        | "dormant"
      admission_payment_type:
        | "application_fee"
        | "token_fee"
        | "full_fee"
        | "hostel_fee"
        | "other"
      api_key_status: "active" | "inactive" | "expired"
      app_type: "internal" | "external"
      application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "documents_pending"
        | "interview_scheduled"
        | "interviewed"
        | "approved"
        | "waitlisted"
        | "rejected"
        | "withdrawn"
      application_type: "Internal" | "External"
      approval_status: "pending" | "approved" | "rejected" | "escalated"
      assignment_type:
        | "round_robin"
        | "load_balanced"
        | "skill_based"
        | "manual"
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
      campaign_status: "draft" | "active" | "paused" | "completed" | "archived"
      category_status: "active" | "inactive" | "archived"
      commission_transaction_type: "earned" | "paid" | "clawback" | "adjustment"
      commission_type: "percentage" | "flat"
      communication_channel_type:
        | "whatsapp"
        | "sms"
        | "email"
        | "voice"
        | "push"
      communication_priority: "low" | "normal" | "high" | "urgent"
      communication_type: "announcement" | "message" | "alert"
      consultant_status: "draft" | "active" | "inactive" | "blacklisted"
      consultant_tier: "bronze" | "silver" | "gold" | "platinum" | "diamond"
      consultant_type: "external" | "student" | "alumni"
      contract_status: "draft" | "active" | "expired" | "terminated"
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
      dependency_status: "pending" | "in_progress" | "completed" | "blocked"
      document_verification_status:
        | "pending"
        | "verified"
        | "rejected"
        | "reupload_requested"
      escalation_status: "triggered" | "acknowledged" | "resolved" | "expired"
      exam_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "no_show"
        | "cancelled"
      exam_type: "online" | "offline" | "third_party"
      integration_type: "direct_link" | "embedded" | "api"
      interview_outcome: "selected" | "waitlisted" | "rejected" | "pending"
      interview_status:
        | "scheduled"
        | "completed"
        | "no_show"
        | "rescheduled"
        | "cancelled"
      kr_data_source: "manual" | "auto"
      kr_status:
        | "not_started"
        | "on_track"
        | "at_risk"
        | "behind"
        | "blocked"
        | "completed"
      lead_ownership_mode: "permanent" | "flexible" | "stage_based" | "pool"
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
      message_direction: "inbound" | "outbound"
      message_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "replied"
      nps_category: "promoter" | "passive" | "detractor"
      offer_response: "pending" | "accepted" | "rejected" | "expired"
      okr_cycle_type: "annual" | "quarterly" | "semester"
      okr_entity_type: "objective" | "key_result" | "check_in"
      okr_level: "institution" | "department" | "individual"
      okr_reaction_type:
        | "like"
        | "celebrate"
        | "support"
        | "insightful"
        | "concern"
        | "question"
      okr_status: "draft" | "active" | "completed" | "archived"
      okr_tier: "tier_1" | "tier_2" | "tier_3"
      parent_activity_type:
        | "login"
        | "view_dashboard"
        | "view_attendance"
        | "view_fees"
        | "view_grades"
        | "read_message"
        | "submit_survey"
        | "logout"
      parent_relationship: "father" | "mother" | "guardian" | "other"
      payment_query_status: "open" | "in_progress" | "resolved" | "closed"
      payment_status:
        | "pending"
        | "processing"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      payout_batch_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "processing"
        | "completed"
        | "cancelled"
      platform_type: "web" | "mobile" | "both"
      referral_reward_type: "discount" | "cashback" | "credits"
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
      scholarship_type:
        | "merit"
        | "need_based"
        | "sports"
        | "minority"
        | "special"
        | "government"
      sensitivity_level: "public" | "restricted" | "confidential"
      source_type:
        | "organic"
        | "paid"
        | "referral"
        | "direct"
        | "partner"
        | "walk_in"
        | "phone"
        | "event"
      stakeholder_type: "parent" | "learner" | "alumni" | "industry" | "staff"
      student_status: "active" | "inactive" | "exited" | "graduated" | "pending"
      supported_platform: "Web" | "Mobile" | "Both"
      survey_status: "draft" | "active" | "closed" | "archived"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "overdue"
        | "cancelled"
      task_type:
        | "follow_up_call"
        | "send_document"
        | "schedule_interview"
        | "verify_documents"
        | "collect_payment"
        | "custom"
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
      workflow_status:
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "paused"
      workflow_trigger_type:
        | "lead.created"
        | "lead.stage_changed"
        | "lead.score_changed"
        | "lead.assigned"
        | "message.sent"
        | "message.delivered"
        | "message.read"
        | "message.replied"
        | "task.created"
        | "task.completed"
        | "task.overdue"
        | "application.started"
        | "application.submitted"
        | "document.uploaded"
        | "payment.received"
        | "interview.scheduled"
        | "schedule"
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
      admission_lead_stage: [
        "new",
        "contacted",
        "engaged",
        "qualified",
        "application_started",
        "application_submitted",
        "documents_pending",
        "documents_verified",
        "interview_scheduled",
        "interview_completed",
        "offer_sent",
        "offer_accepted",
        "token_paid",
        "applied",
        "interviewed",
        "offered",
        "enrolled",
        "lost",
        "dormant",
      ],
      admission_payment_type: [
        "application_fee",
        "token_fee",
        "full_fee",
        "hostel_fee",
        "other",
      ],
      api_key_status: ["active", "inactive", "expired"],
      app_type: ["internal", "external"],
      application_status: [
        "draft",
        "submitted",
        "under_review",
        "documents_pending",
        "interview_scheduled",
        "interviewed",
        "approved",
        "waitlisted",
        "rejected",
        "withdrawn",
      ],
      application_type: ["Internal", "External"],
      approval_status: ["pending", "approved", "rejected", "escalated"],
      assignment_type: [
        "round_robin",
        "load_balanced",
        "skill_based",
        "manual",
      ],
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
      campaign_status: ["draft", "active", "paused", "completed", "archived"],
      category_status: ["active", "inactive", "archived"],
      commission_transaction_type: ["earned", "paid", "clawback", "adjustment"],
      commission_type: ["percentage", "flat"],
      communication_channel_type: ["whatsapp", "sms", "email", "voice", "push"],
      communication_priority: ["low", "normal", "high", "urgent"],
      communication_type: ["announcement", "message", "alert"],
      consultant_status: ["draft", "active", "inactive", "blacklisted"],
      consultant_tier: ["bronze", "silver", "gold", "platinum", "diamond"],
      consultant_type: ["external", "student", "alumni"],
      contract_status: ["draft", "active", "expired", "terminated"],
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
      dependency_status: ["pending", "in_progress", "completed", "blocked"],
      document_verification_status: [
        "pending",
        "verified",
        "rejected",
        "reupload_requested",
      ],
      escalation_status: ["triggered", "acknowledged", "resolved", "expired"],
      exam_status: [
        "scheduled",
        "in_progress",
        "completed",
        "no_show",
        "cancelled",
      ],
      exam_type: ["online", "offline", "third_party"],
      integration_type: ["direct_link", "embedded", "api"],
      interview_outcome: ["selected", "waitlisted", "rejected", "pending"],
      interview_status: [
        "scheduled",
        "completed",
        "no_show",
        "rescheduled",
        "cancelled",
      ],
      kr_data_source: ["manual", "auto"],
      kr_status: [
        "not_started",
        "on_track",
        "at_risk",
        "behind",
        "blocked",
        "completed",
      ],
      lead_ownership_mode: ["permanent", "flexible", "stage_based", "pool"],
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
      message_direction: ["inbound", "outbound"],
      message_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "replied",
      ],
      nps_category: ["promoter", "passive", "detractor"],
      offer_response: ["pending", "accepted", "rejected", "expired"],
      okr_cycle_type: ["annual", "quarterly", "semester"],
      okr_entity_type: ["objective", "key_result", "check_in"],
      okr_level: ["institution", "department", "individual"],
      okr_reaction_type: [
        "like",
        "celebrate",
        "support",
        "insightful",
        "concern",
        "question",
      ],
      okr_status: ["draft", "active", "completed", "archived"],
      okr_tier: ["tier_1", "tier_2", "tier_3"],
      parent_activity_type: [
        "login",
        "view_dashboard",
        "view_attendance",
        "view_fees",
        "view_grades",
        "read_message",
        "submit_survey",
        "logout",
      ],
      parent_relationship: ["father", "mother", "guardian", "other"],
      payment_query_status: ["open", "in_progress", "resolved", "closed"],
      payment_status: [
        "pending",
        "processing",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      payout_batch_status: [
        "draft",
        "pending_approval",
        "approved",
        "processing",
        "completed",
        "cancelled",
      ],
      platform_type: ["web", "mobile", "both"],
      referral_reward_type: ["discount", "cashback", "credits"],
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
      scholarship_type: [
        "merit",
        "need_based",
        "sports",
        "minority",
        "special",
        "government",
      ],
      sensitivity_level: ["public", "restricted", "confidential"],
      source_type: [
        "organic",
        "paid",
        "referral",
        "direct",
        "partner",
        "walk_in",
        "phone",
        "event",
      ],
      stakeholder_type: ["parent", "learner", "alumni", "industry", "staff"],
      student_status: ["active", "inactive", "exited", "graduated", "pending"],
      supported_platform: ["Web", "Mobile", "Both"],
      survey_status: ["draft", "active", "closed", "archived"],
      task_status: [
        "pending",
        "in_progress",
        "completed",
        "overdue",
        "cancelled",
      ],
      task_type: [
        "follow_up_call",
        "send_document",
        "schedule_interview",
        "verify_documents",
        "collect_payment",
        "custom",
      ],
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
      workflow_status: [
        "running",
        "completed",
        "failed",
        "cancelled",
        "paused",
      ],
      workflow_trigger_type: [
        "lead.created",
        "lead.stage_changed",
        "lead.score_changed",
        "lead.assigned",
        "message.sent",
        "message.delivered",
        "message.read",
        "message.replied",
        "task.created",
        "task.completed",
        "task.overdue",
        "application.started",
        "application.submitted",
        "document.uploaded",
        "payment.received",
        "interview.scheduled",
        "schedule",
      ],
    },
  },
} as const
