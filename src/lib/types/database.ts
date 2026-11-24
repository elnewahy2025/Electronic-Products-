
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "allowed_file_types": {
                  Row: {
                    "extension": string,"id": string,"is_enabled": boolean,"max_size_bytes": number | null,"mime": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "extension": string,"id"?: string,"is_enabled"?: boolean,"max_size_bytes"?: number | null,"mime": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "extension"?: string,"id"?: string,"is_enabled"?: boolean,"max_size_bytes"?: number | null,"mime"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowed_file_types_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"api_concurrency_locks": {
                  Row: {
                    "created_at": string,"expires_at": string,"lock_key": string,"owner_token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"lock_key": string,"owner_token": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"lock_key"?: string,"owner_token"?: string
                  }
                  Relationships: [
                    
                  ]
                },"api_rate_limit_hits": {
                  Row: {
                    "bucket_key": string,"created_at": string,"id": number,"ip": unknown,"scope": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_key": string,"created_at"?: string,"id"?: never,"ip"?: unknown,"scope": string
                  }
                  Update: {
                    "bucket_key"?: string,"created_at"?: string,"id"?: never,"ip"?: unknown,"scope"?: string
                  }
                  Relationships: [
                    
                  ]
                },"attempt_exception_requests": {
                  Row: {
                    "code_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"granted_attempts": number | null,"id": string,"reason": string,"requested_by": string | null,"session_id": string | null,"status": Database["public"]['Enums']["exception_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "code_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"granted_attempts"?: number | null,"id"?: string,"reason": string,"requested_by"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["exception_status_enum"]
                  }
                  Update: {
                    "code_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"granted_attempts"?: number | null,"id"?: string,"reason"?: string,"requested_by"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["exception_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempt_exception_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "attempt_exception_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_exception_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "attempt_exception_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_exception_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_exception_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_exception_requests_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "attempt_exception_requests_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"attempt_exception_settings": {
                  Row: {
                    "id": number,"reason_required": boolean,"super_admin_only": boolean,"updated_at": string,"updated_by": string | null,"warning_threshold": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"reason_required"?: boolean,"super_admin_only"?: boolean,"updated_at"?: string,"updated_by"?: string | null,"warning_threshold"?: number
                  }
                  Update: {
                    "id"?: number,"reason_required"?: boolean,"super_admin_only"?: boolean,"updated_at"?: string,"updated_by"?: string | null,"warning_threshold"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempt_exception_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_archives": {
                  Row: {
                    "archived_at": string,"archived_by": string | null,"checksum": string | null,"id": string,"period_end": string,"period_start": string,"records_count": number,"storage_location": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string,"archived_by"?: string | null,"checksum"?: string | null,"id"?: string,"period_end": string,"period_start": string,"records_count"?: number,"storage_location": string
                  }
                  Update: {
                    "archived_at"?: string,"archived_by"?: string | null,"checksum"?: string | null,"id"?: string,"period_end"?: string,"period_start"?: string,"records_count"?: number,"storage_location"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_archives_archived_by_fkey"
      columns: ["archived_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_role": string | null,"after_value": Json | null,"before_value": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string | null,"id": number,"ip": unknown,"reason": string | null,"request_id": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_role"?: string | null,"after_value"?: Json | null,"before_value"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: number,"ip"?: unknown,"reason"?: string | null,"request_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_role"?: string | null,"after_value"?: Json | null,"before_value"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: number,"ip"?: unknown,"reason"?: string | null,"request_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_settings": {
                  Row: {
                    "append_only_enforced": boolean,"id": number,"post_retention_action": string,"retention_days": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "append_only_enforced"?: boolean,"id"?: number,"post_retention_action"?: string,"retention_days"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "append_only_enforced"?: boolean,"id"?: number,"post_retention_action"?: string,"retention_days"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"backup_archives": {
                  Row: {
                    "backup_job_id": string,"checksum": string | null,"created_at": string,"id": string,"period_end": string | null,"period_start": string | null,"restore_prereqs": Json | null,"row_counts": Json | null,"source_pg_version": string | null,"storage_evidence": Json | null,"storage_location": string
                  }
                  ComputedFields: never
                  Insert: {
                    "backup_job_id": string,"checksum"?: string | null,"created_at"?: string,"id"?: string,"period_end"?: string | null,"period_start"?: string | null,"restore_prereqs"?: Json | null,"row_counts"?: Json | null,"source_pg_version"?: string | null,"storage_evidence"?: Json | null,"storage_location": string
                  }
                  Update: {
                    "backup_job_id"?: string,"checksum"?: string | null,"created_at"?: string,"id"?: string,"period_end"?: string | null,"period_start"?: string | null,"restore_prereqs"?: Json | null,"row_counts"?: Json | null,"source_pg_version"?: string | null,"storage_evidence"?: Json | null,"storage_location"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "backup_archives_backup_job_id_fkey"
      columns: ["backup_job_id"]
isOneToOne: false
      referencedRelation: "backup_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"backup_jobs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": string,"size_bytes": number | null,"started_at": string,"status": Database["public"]['Enums']["backup_job_status_enum"],"storage_location": string | null,"triggered_by": string | null,"type": Database["public"]['Enums']["backup_job_type_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"size_bytes"?: number | null,"started_at"?: string,"status"?: Database["public"]['Enums']["backup_job_status_enum"],"storage_location"?: string | null,"triggered_by"?: string | null,"type": Database["public"]['Enums']["backup_job_type_enum"]
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"size_bytes"?: number | null,"started_at"?: string,"status"?: Database["public"]['Enums']["backup_job_status_enum"],"storage_location"?: string | null,"triggered_by"?: string | null,"type"?: Database["public"]['Enums']["backup_job_type_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "backup_jobs_triggered_by_fkey"
      columns: ["triggered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"backup_settings": {
                  Row: {
                    "encryption_enabled": boolean,"id": number,"include_files": boolean,"manual_enabled": boolean,"restore_test_frequency_days": number,"retention_days": number,"schedule": Database["public"]['Enums']["backup_schedule_enum"],"storage_provider": Database["public"]['Enums']["backup_storage_provider_enum"] | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "encryption_enabled"?: boolean,"id"?: number,"include_files"?: boolean,"manual_enabled"?: boolean,"restore_test_frequency_days"?: number,"retention_days"?: number,"schedule"?: Database["public"]['Enums']["backup_schedule_enum"],"storage_provider"?: Database["public"]['Enums']["backup_storage_provider_enum"] | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "encryption_enabled"?: boolean,"id"?: number,"include_files"?: boolean,"manual_enabled"?: boolean,"restore_test_frequency_days"?: number,"retention_days"?: number,"schedule"?: Database["public"]['Enums']["backup_schedule_enum"],"storage_provider"?: Database["public"]['Enums']["backup_storage_provider_enum"] | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "backup_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "cover_image_url": string | null,"cover_storage_path": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"parent_id": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_image_url"?: string | null,"cover_storage_path"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"parent_id"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "cover_image_url"?: string | null,"cover_storage_path"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"parent_id"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "storefront_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "storefront_top_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"code_delivery_attempts": {
                  Row: {
                    "channel": Database["public"]['Enums']["delivery_channel_enum"],"code_id": string,"error": string | null,"id": string,"result": Database["public"]['Enums']["delivery_result_enum"],"sent_at": string,"sent_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": Database["public"]['Enums']["delivery_channel_enum"],"code_id": string,"error"?: string | null,"id"?: string,"result"?: Database["public"]['Enums']["delivery_result_enum"],"sent_at"?: string,"sent_by"?: string | null
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["delivery_channel_enum"],"code_id"?: string,"error"?: string | null,"id"?: string,"result"?: Database["public"]['Enums']["delivery_result_enum"],"sent_at"?: string,"sent_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "code_delivery_attempts_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "code_delivery_attempts_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "code_delivery_attempts_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "code_delivery_attempts_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "code_delivery_attempts_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"code_plaintext_handoff": {
                  Row: {
                    "code_id": string,"consumed_at": string | null,"created_at": string,"expires_at": string,"plaintext": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code_id": string,"consumed_at"?: string | null,"created_at"?: string,"expires_at": string,"plaintext": string
                  }
                  Update: {
                    "code_id"?: string,"consumed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"plaintext"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "code_plaintext_handoff_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "code_plaintext_handoff_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "code_plaintext_handoff_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "code_plaintext_handoff_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"code_redemptions": {
                  Row: {
                    "code_id": string,"id": string,"ip": unknown,"redeemed_at": string,"redeemed_by": string | null,"session_id": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_id": string,"id"?: string,"ip"?: unknown,"redeemed_at"?: string,"redeemed_by"?: string | null,"session_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "code_id"?: string,"id"?: string,"ip"?: unknown,"redeemed_at"?: string,"redeemed_by"?: string | null,"session_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "code_redemptions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "code_redemptions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "code_redemptions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "code_redemptions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: true
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "code_redemptions_redeemed_by_fkey"
      columns: ["redeemed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_settings": {
                  Row: {
                    "default_rate": number,"id": number,"per_product_type_override_enabled": boolean,"per_seller_override_enabled": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "default_rate"?: number,"id"?: number,"per_product_type_override_enabled"?: boolean,"per_seller_override_enabled"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "default_rate"?: number,"id"?: number,"per_product_type_override_enabled"?: boolean,"per_seller_override_enabled"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"compensation_requests": {
                  Row: {
                    "admin_reason": string | null,"approved_session_id": string | null,"code_id": string,"decided_at": string | null,"decided_by": string | null,"id": string,"original_session_id": string | null,"reason": string,"requested_at": string,"requested_by": string,"sequence_number": number,"status": Database["public"]['Enums']["compensation_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_reason"?: string | null,"approved_session_id"?: string | null,"code_id": string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"original_session_id"?: string | null,"reason": string,"requested_at"?: string,"requested_by": string,"sequence_number": number,"status"?: Database["public"]['Enums']["compensation_status_enum"]
                  }
                  Update: {
                    "admin_reason"?: string | null,"approved_session_id"?: string | null,"code_id"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"original_session_id"?: string | null,"reason"?: string,"requested_at"?: string,"requested_by"?: string,"sequence_number"?: number,"status"?: Database["public"]['Enums']["compensation_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "compensation_requests_approved_session_id_fkey"
      columns: ["approved_session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "compensation_requests_approved_session_id_fkey"
      columns: ["approved_session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_original_session_id_fkey"
      columns: ["original_session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "compensation_requests_original_session_id_fkey"
      columns: ["original_session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"compensation_settings": {
                  Row: {
                    "id": number,"max_sessions_per_product": number,"reason_required": boolean,"requires_admin_approval": boolean,"session_duration_hours": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"max_sessions_per_product"?: number,"reason_required"?: boolean,"requires_admin_approval"?: boolean,"session_duration_hours"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "id"?: number,"max_sessions_per_product"?: number,"reason_required"?: boolean,"requires_admin_approval"?: boolean,"session_duration_hours"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compensation_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"content_reports": {
                  Row: {
                    "created_at": string,"entity_id": string,"entity_type": string,"id": string,"reason": string,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["report_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"reason": string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status_enum"]
                  }
                  Update: {
                    "created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"reason"?: string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"download_attempts": {
                  Row: {
                    "attempt_number": number,"completed": boolean,"consumed_at": string,"id": string,"order_item_id": string,"session_id": string | null,"type": Database["public"]['Enums']["download_attempt_type_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_number": number,"completed"?: boolean,"consumed_at"?: string,"id"?: string,"order_item_id": string,"session_id"?: string | null,"type": Database["public"]['Enums']["download_attempt_type_enum"]
                  }
                  Update: {
                    "attempt_number"?: number,"completed"?: boolean,"consumed_at"?: string,"id"?: string,"order_item_id"?: string,"session_id"?: string | null,"type"?: Database["public"]['Enums']["download_attempt_type_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "download_attempts_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "download_attempts_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_attempts_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "download_attempts_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"download_deliveries": {
                  Row: {
                    "bytes_sent": number | null,"checksum": string | null,"completed": boolean,"delivered_at": string,"delivery_type": Database["public"]['Enums']["download_delivery_type_enum"],"failure_reason": string | null,"file_version_id": string,"id": string,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes_sent"?: number | null,"checksum"?: string | null,"completed"?: boolean,"delivered_at"?: string,"delivery_type": Database["public"]['Enums']["download_delivery_type_enum"],"failure_reason"?: string | null,"file_version_id": string,"id"?: string,"session_id": string
                  }
                  Update: {
                    "bytes_sent"?: number | null,"checksum"?: string | null,"completed"?: boolean,"delivered_at"?: string,"delivery_type"?: Database["public"]['Enums']["download_delivery_type_enum"],"failure_reason"?: string | null,"file_version_id"?: string,"id"?: string,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "download_deliveries_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_deliveries_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_deliveries_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "download_deliveries_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"download_sessions": {
                  Row: {
                    "attempt_consumed": boolean,"buyer_id": string | null,"code_id": string,"compensation_request_id": string | null,"created_at": string,"created_by": string | null,"ended_at": string | null,"expires_at": string,"id": string,"is_compensation": boolean,"order_item_id": string,"parent_session_id": string | null,"product_version_id": string,"revocation_confirmed_by": string | null,"revocation_reason": string | null,"revocation_suggested_by_system": boolean,"revoked_at": string | null,"started_at": string,"status": Database["public"]['Enums']["download_session_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_consumed"?: boolean,"buyer_id"?: string | null,"code_id": string,"compensation_request_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ended_at"?: string | null,"expires_at": string,"id"?: string,"is_compensation"?: boolean,"order_item_id": string,"parent_session_id"?: string | null,"product_version_id": string,"revocation_confirmed_by"?: string | null,"revocation_reason"?: string | null,"revocation_suggested_by_system"?: boolean,"revoked_at"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["download_session_status_enum"]
                  }
                  Update: {
                    "attempt_consumed"?: boolean,"buyer_id"?: string | null,"code_id"?: string,"compensation_request_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ended_at"?: string | null,"expires_at"?: string,"id"?: string,"is_compensation"?: boolean,"order_item_id"?: string,"parent_session_id"?: string | null,"product_version_id"?: string,"revocation_confirmed_by"?: string | null,"revocation_reason"?: string | null,"revocation_suggested_by_system"?: boolean,"revoked_at"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["download_session_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "download_sessions_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "download_sessions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "download_sessions_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "download_sessions_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_parent_session_id_fkey"
      columns: ["parent_session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "download_sessions_parent_session_id_fkey"
      columns: ["parent_session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_product_version_id_fkey"
      columns: ["product_version_id"]
isOneToOne: false
      referencedRelation: "product_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_sessions_revocation_confirmed_by_fkey"
      columns: ["revocation_confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_download_sessions_compensation"
      columns: ["compensation_request_id"]
isOneToOne: false
      referencedRelation: "buyer_compensation_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_download_sessions_compensation"
      columns: ["compensation_request_id"]
isOneToOne: false
      referencedRelation: "compensation_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"download_settings": {
                  Row: {
                    "code_validity_hours": number,"id": number,"max_attempts_per_product": number,"partial_session_new_duration_hours": number,"session_duration_hours": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_validity_hours"?: number,"id"?: number,"max_attempts_per_product"?: number,"partial_session_new_duration_hours"?: number,"session_duration_hours"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "code_validity_hours"?: number,"id"?: number,"max_attempts_per_product"?: number,"partial_session_new_duration_hours"?: number,"session_duration_hours"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "download_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"download_tokens": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"expires_at": string,"file_version_id": string | null,"id": string,"scope": Database["public"]['Enums']["download_token_scope_enum"],"session_id": string,"token_hash": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"expires_at": string,"file_version_id"?: string | null,"id"?: string,"scope": Database["public"]['Enums']["download_token_scope_enum"],"session_id": string,"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"file_version_id"?: string | null,"id"?: string,"scope"?: Database["public"]['Enums']["download_token_scope_enum"],"session_id"?: string,"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "download_tokens_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_tokens_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "download_tokens_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "download_tokens_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"html_body": string | null,"id": string,"last_error": string | null,"max_attempts": number,"provider_message_id": string | null,"reference_id": string | null,"reference_type": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["email_outbox_status_enum"],"subject": string,"template": string,"text_body": string,"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"html_body"?: string | null,"id"?: string,"last_error"?: string | null,"max_attempts"?: number,"provider_message_id"?: string | null,"reference_id"?: string | null,"reference_type"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["email_outbox_status_enum"],"subject": string,"template"?: string,"text_body": string,"to_email": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"html_body"?: string | null,"id"?: string,"last_error"?: string | null,"max_attempts"?: number,"provider_message_id"?: string | null,"reference_id"?: string | null,"reference_type"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["email_outbox_status_enum"],"subject"?: string,"template"?: string,"text_body"?: string,"to_email"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exchange_rates": {
                  Row: {
                    "base_currency": string,"effective_at": string,"id": string,"quote_currency": string,"rate": number,"set_at": string,"set_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "base_currency": string,"effective_at"?: string,"id"?: string,"quote_currency": string,"rate": number,"set_at"?: string,"set_by"?: string | null
                  }
                  Update: {
                    "base_currency"?: string,"effective_at"?: string,"id"?: string,"quote_currency"?: string,"rate"?: number,"set_at"?: string,"set_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exchange_rates_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "buyer_id": string,"created_at": string,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_id": string,"created_at"?: string,"product_id": string
                  }
                  Update: {
                    "buyer_id"?: string,"created_at"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    }
                  ]
                },"file_previews": {
                  Row: {
                    "attempts": number,"created_at": string,"error": string | null,"file_version_id": string,"generated_by": string | null,"id": string,"preview_type": Database["public"]['Enums']["preview_type_enum"],"public_url": string | null,"quality": Database["public"]['Enums']["preview_quality_enum"],"status": string,"storage_location_id": string | null,"storage_path": string | null,"watermark_applied": boolean,"watermark_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"file_version_id": string,"generated_by"?: string | null,"id"?: string,"preview_type": Database["public"]['Enums']["preview_type_enum"],"public_url"?: string | null,"quality"?: Database["public"]['Enums']["preview_quality_enum"],"status"?: string,"storage_location_id"?: string | null,"storage_path"?: string | null,"watermark_applied"?: boolean,"watermark_text"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"file_version_id"?: string,"generated_by"?: string | null,"id"?: string,"preview_type"?: Database["public"]['Enums']["preview_type_enum"],"public_url"?: string | null,"quality"?: Database["public"]['Enums']["preview_quality_enum"],"status"?: string,"storage_location_id"?: string | null,"storage_path"?: string | null,"watermark_applied"?: boolean,"watermark_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_previews_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_previews_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_previews_storage_location_id_fkey"
      columns: ["storage_location_id"]
isOneToOne: false
      referencedRelation: "file_storage_locations"
      referencedColumns: ["id"]
    }
                  ]
                },"file_storage_locations": {
                  Row: {
                    "created_at": string,"id": string,"internal_path": string | null,"provider": Database["public"]['Enums']["storage_provider_enum"],"provider_file_id": string | null,"provider_folder_id": string | null,"seller_drive_account_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"internal_path"?: string | null,"provider": Database["public"]['Enums']["storage_provider_enum"],"provider_file_id"?: string | null,"provider_folder_id"?: string | null,"seller_drive_account_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"internal_path"?: string | null,"provider"?: Database["public"]['Enums']["storage_provider_enum"],"provider_file_id"?: string | null,"provider_folder_id"?: string | null,"seller_drive_account_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_storage_locations_seller_drive_account_id_fkey"
      columns: ["seller_drive_account_id"]
isOneToOne: false
      referencedRelation: "seller_drive_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_storage_locations_seller_drive_account_id_fkey"
      columns: ["seller_drive_account_id"]
isOneToOne: false
      referencedRelation: "seller_drive_accounts_safe"
      referencedColumns: ["id"]
    }
                  ]
                },"file_versions": {
                  Row: {
                    "checksum_sha256": string | null,"created_at": string,"extension": string | null,"file_id": string,"id": string,"mime": string | null,"scan_status": Database["public"]['Enums']["file_scan_status_enum"],"size_bytes": number,"storage_location_id": string | null,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "checksum_sha256"?: string | null,"created_at"?: string,"extension"?: string | null,"file_id": string,"id"?: string,"mime"?: string | null,"scan_status"?: Database["public"]['Enums']["file_scan_status_enum"],"size_bytes"?: number,"storage_location_id"?: string | null,"version_number": number
                  }
                  Update: {
                    "checksum_sha256"?: string | null,"created_at"?: string,"extension"?: string | null,"file_id"?: string,"id"?: string,"mime"?: string | null,"scan_status"?: Database["public"]['Enums']["file_scan_status_enum"],"size_bytes"?: number,"storage_location_id"?: string | null,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_versions_storage_location_id_fkey"
      columns: ["storage_location_id"]
isOneToOne: false
      referencedRelation: "file_storage_locations"
      referencedColumns: ["id"]
    }
                  ]
                },"files": {
                  Row: {
                    "created_at": string,"display_name": string | null,"extension": string | null,"id": string,"mime": string | null,"original_name": string,"seller_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"extension"?: string | null,"id"?: string,"mime"?: string | null,"original_name": string,"seller_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"extension"?: string | null,"id"?: string,"mime"?: string | null,"original_name"?: string,"seller_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "files_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"financial_transactions": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"id": string,"reference_id": string | null,"reference_type": string | null,"type": Database["public"]['Enums']["wallet_tx_type_enum"],"wallet_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"currency": string,"id"?: string,"reference_id"?: string | null,"reference_type"?: string | null,"type": Database["public"]['Enums']["wallet_tx_type_enum"],"wallet_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"reference_id"?: string | null,"reference_type"?: string | null,"type"?: Database["public"]['Enums']["wallet_tx_type_enum"],"wallet_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_transactions_wallet_id_fkey"
      columns: ["wallet_id"]
isOneToOne: false
      referencedRelation: "seller_wallets"
      referencedColumns: ["id"]
    }
                  ]
                },"general_settings": {
                  Row: {
                    "allowed_currencies": (string)[],"default_currency": string,"id": number,"maintenance_mode": boolean,"platform_contact_email": string | null,"platform_contact_phone": string | null,"platform_name": string | null,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_currencies"?: (string)[],"default_currency"?: string,"id"?: number,"maintenance_mode"?: boolean,"platform_contact_email"?: string | null,"platform_contact_phone"?: string | null,"platform_name"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "allowed_currencies"?: (string)[],"default_currency"?: string,"id"?: number,"maintenance_mode"?: boolean,"platform_contact_email"?: string | null,"platform_contact_phone"?: string | null,"platform_name"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "general_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_permissions": {
                  Row: {
                    "expires_at": string | null,"granted_at": string,"granted_by": string | null,"member_id": string,"permission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"member_id": string,"permission_id": string
                  }
                  Update: {
                    "expires_at"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"member_id"?: string,"permission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_permissions_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_permissions_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_permissions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["id"]
    }
                  ]
                },"mfa_attempts": {
                  Row: {
                    "failed_count": number,"first_failed_at": string,"locked_until": string | null,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "failed_count"?: number,"first_failed_at"?: string,"locked_until"?: string | null,"profile_id": string
                  }
                  Update: {
                    "failed_count"?: number,"first_failed_at"?: string,"locked_until"?: string | null,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mfa_attempts_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"mfa_enrollments": {
                  Row: {
                    "created_at": string,"expires_at": string,"profile_id": string,"secret_encrypted": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"profile_id": string,"secret_encrypted": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"profile_id"?: string,"secret_encrypted"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mfa_enrollments_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"category": string,"created_at": string,"data": Json | null,"id": string,"link": string | null,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"category"?: string,"created_at"?: string,"data"?: Json | null,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"category"?: string,"created_at"?: string,"data"?: Json | null,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "commission_amount": number,"commission_rate_at_sale": number,"created_at": string,"currency": string,"id": string,"net_seller_amount": number,"order_id": string,"price": number,"product_id": string,"product_version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commission_amount"?: number,"commission_rate_at_sale"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"net_seller_amount"?: number,"order_id": string,"price": number,"product_id": string,"product_version_id": string
                  }
                  Update: {
                    "commission_amount"?: number,"commission_rate_at_sale"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"net_seller_amount"?: number,"order_id"?: string,"price"?: number,"product_id"?: string,"product_version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "buyer_orders_view"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_version_id_fkey"
      columns: ["product_version_id"]
isOneToOne: false
      referencedRelation: "product_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount_in_usd": number,"buyer_id": string | null,"created_at": string,"currency": string,"exchange_rate_at_purchase": number,"id": string,"purchase_request_id": string,"status": Database["public"]['Enums']["order_status_enum"],"total_amount": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_in_usd"?: number,"buyer_id"?: string | null,"created_at"?: string,"currency"?: string,"exchange_rate_at_purchase"?: number,"id"?: string,"purchase_request_id": string,"status"?: Database["public"]['Enums']["order_status_enum"],"total_amount"?: number
                  }
                  Update: {
                    "amount_in_usd"?: number,"buyer_id"?: string | null,"created_at"?: string,"currency"?: string,"exchange_rate_at_purchase"?: number,"id"?: string,"purchase_request_id"?: string,"status"?: Database["public"]['Enums']["order_status_enum"],"total_amount"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "orders_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "buyer_orders_view"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "orders_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "orders_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "purchase_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"id": string,"order_id": string | null,"provider": string | null,"provider_reference": string | null,"status": Database["public"]['Enums']["payment_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"currency": string,"id"?: string,"order_id"?: string | null,"provider"?: string | null,"provider_reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status_enum"]
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"order_id"?: string | null,"provider"?: string | null,"provider_reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "buyer_orders_view"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_settings": {
                  Row: {
                    "allowed_methods": (string)[] | null,"id": number,"minimum_amount": number,"minimum_currency": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_methods"?: (string)[] | null,"id"?: number,"minimum_amount"?: number,"minimum_currency"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "allowed_methods"?: (string)[] | null,"id"?: number,"minimum_amount"?: number,"minimum_currency"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pricing_settings": {
                  Row: {
                    "id": number,"min_product_price": number,"min_product_price_currency": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"min_product_price"?: number,"min_product_price_currency"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "id"?: number,"min_product_price"?: number,"min_product_price_currency"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"product_gallery_images": {
                  Row: {
                    "created_at": string,"id": string,"product_id": string,"sort_order": number,"storage_path": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"product_id": string,"sort_order"?: number,"storage_path"?: string | null,"url": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"product_id"?: string,"sort_order"?: number,"storage_path"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_gallery_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_gallery_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_rating_stats": {
                  Row: {
                    "avg_rating": number,"product_id": string,"review_count": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_rating"?: number,"product_id": string,"review_count"?: number,"updated_at"?: string
                  }
                  Update: {
                    "avg_rating"?: number,"product_id"?: string,"review_count"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_rating_stats_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_rating_stats_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_tags": {
                  Row: {
                    "product_id": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "product_id": string,"tag_id": string
                  }
                  Update: {
                    "product_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_tags_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_tags_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"product_version_files": {
                  Row: {
                    "display_name": string | null,"file_version_id": string,"id": string,"included_in_zip": boolean,"product_version_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "display_name"?: string | null,"file_version_id": string,"id"?: string,"included_in_zip"?: boolean,"product_version_id": string,"sort_order"?: number
                  }
                  Update: {
                    "display_name"?: string | null,"file_version_id"?: string,"id"?: string,"included_in_zip"?: boolean,"product_version_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_version_files_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_version_files_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_version_files_product_version_id_fkey"
      columns: ["product_version_id"]
isOneToOne: false
      referencedRelation: "product_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"product_versions": {
                  Row: {
                    "created_at": string,"id": string,"product_id": string,"published_at": string | null,"status": Database["public"]['Enums']["version_status_enum"],"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"product_id": string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["version_status_enum"],"version_number": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"product_id"?: string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["version_status_enum"],"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_versions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_versions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category_id": string | null,"cover_image_url": string | null,"cover_storage_path": string | null,"created_at": string,"deleted_at": string | null,"description": string | null,"id": string,"min_price_checked_at": string | null,"price_amount": number,"price_currency": string,"published_at": string | null,"rejection_reason": string | null,"seller_id": string,"short_description": string | null,"slug": string,"status": Database["public"]['Enums']["product_status_enum"],"suspension_reason": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"cover_image_url"?: string | null,"cover_storage_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"id"?: string,"min_price_checked_at"?: string | null,"price_amount": number,"price_currency"?: string,"published_at"?: string | null,"rejection_reason"?: string | null,"seller_id": string,"short_description"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["product_status_enum"],"suspension_reason"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"cover_image_url"?: string | null,"cover_storage_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"id"?: string,"min_price_checked_at"?: string | null,"price_amount"?: number,"price_currency"?: string,"published_at"?: string | null,"rejection_reason"?: string | null,"seller_id"?: string,"short_description"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["product_status_enum"],"suspension_reason"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "storefront_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "storefront_top_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "products_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type_enum"],"auth_provider": Database["public"]['Enums']["auth_provider_enum"],"avatar_url": string | null,"created_at": string,"email": string,"email_verified_at": string | null,"full_name": string | null,"id": string,"last_login_at": string | null,"mfa_enabled": boolean,"mfa_enforced": boolean,"mfa_secret_encrypted": string | null,"phone": string | null,"status": Database["public"]['Enums']["user_status_enum"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type"?: Database["public"]['Enums']["account_type_enum"],"auth_provider"?: Database["public"]['Enums']["auth_provider_enum"],"avatar_url"?: string | null,"created_at"?: string,"email": string,"email_verified_at"?: string | null,"full_name"?: string | null,"id"?: string,"last_login_at"?: string | null,"mfa_enabled"?: boolean,"mfa_enforced"?: boolean,"mfa_secret_encrypted"?: string | null,"phone"?: string | null,"status"?: Database["public"]['Enums']["user_status_enum"],"updated_at"?: string
                  }
                  Update: {
                    "account_type"?: Database["public"]['Enums']["account_type_enum"],"auth_provider"?: Database["public"]['Enums']["auth_provider_enum"],"avatar_url"?: string | null,"created_at"?: string,"email"?: string,"email_verified_at"?: string | null,"full_name"?: string | null,"id"?: string,"last_login_at"?: string | null,"mfa_enabled"?: boolean,"mfa_enforced"?: boolean,"mfa_secret_encrypted"?: string | null,"phone"?: string | null,"status"?: Database["public"]['Enums']["user_status_enum"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchase_codes": {
                  Row: {
                    "code_hash": string,"code_prefix": string,"created_at": string,"delivered_at": string | null,"delivered_by": string | null,"delivery_confirmation_method": Database["public"]['Enums']["delivery_confirmation_method_enum"] | null,"expires_at": string,"id": string,"issued_at": string,"issued_by": string | null,"order_item_id": string,"redeemed_at": string | null,"replacement_for_code_id": string | null,"replacement_reason": string | null,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"status": Database["public"]['Enums']["code_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"code_prefix": string,"created_at"?: string,"delivered_at"?: string | null,"delivered_by"?: string | null,"delivery_confirmation_method"?: Database["public"]['Enums']["delivery_confirmation_method_enum"] | null,"expires_at": string,"id"?: string,"issued_at"?: string,"issued_by"?: string | null,"order_item_id": string,"redeemed_at"?: string | null,"replacement_for_code_id"?: string | null,"replacement_reason"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"status"?: Database["public"]['Enums']["code_status_enum"]
                  }
                  Update: {
                    "code_hash"?: string,"code_prefix"?: string,"created_at"?: string,"delivered_at"?: string | null,"delivered_by"?: string | null,"delivery_confirmation_method"?: Database["public"]['Enums']["delivery_confirmation_method_enum"] | null,"expires_at"?: string,"id"?: string,"issued_at"?: string,"issued_by"?: string | null,"order_item_id"?: string,"redeemed_at"?: string | null,"replacement_for_code_id"?: string | null,"replacement_reason"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"status"?: Database["public"]['Enums']["code_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_codes_delivered_by_fkey"
      columns: ["delivered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_issued_by_fkey"
      columns: ["issued_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "purchase_codes_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_request_attestations": {
                  Row: {
                    "amount": number,"attested_at": string,"attested_by": string,"created_at": string,"currency": string,"id": string,"method": string | null,"purchase_request_id": string,"reference": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"attested_at"?: string,"attested_by"?: string,"created_at"?: string,"currency": string,"id"?: string,"method"?: string | null,"purchase_request_id": string,"reference": string
                  }
                  Update: {
                    "amount"?: number,"attested_at"?: string,"attested_by"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"method"?: string | null,"purchase_request_id"?: string,"reference"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_request_attestations_attested_by_fkey"
      columns: ["attested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_request_attestations_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: true
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "purchase_request_attestations_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: true
      referencedRelation: "buyer_orders_view"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "purchase_request_attestations_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: true
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "purchase_request_attestations_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: true
      referencedRelation: "purchase_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_request_items": {
                  Row: {
                    "currency": string,"id": string,"product_id": string,"product_version_id": string | null,"purchase_request_id": string,"quantity": number,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "currency"?: string,"id"?: string,"product_id": string,"product_version_id"?: string | null,"purchase_request_id": string,"quantity"?: number,"unit_price": number
                  }
                  Update: {
                    "currency"?: string,"id"?: string,"product_id"?: string,"product_version_id"?: string | null,"purchase_request_id"?: string,"quantity"?: number,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_request_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_request_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_request_items_product_version_id_fkey"
      columns: ["product_version_id"]
isOneToOne: false
      referencedRelation: "product_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "buyer_orders_view"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["purchase_request_id"]
    },{
      foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
      columns: ["purchase_request_id"]
isOneToOne: false
      referencedRelation: "purchase_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_requests": {
                  Row: {
                    "access_token_hash": string | null,"amount_in_usd": number,"buyer_id": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"currency": string,"customer_email": string | null,"customer_phone": string | null,"exchange_rate_at_purchase": number,"full_name": string | null,"id": string,"ip": unknown,"notes": string | null,"status": Database["public"]['Enums']["purchase_request_status_enum"],"total_amount": number,"updated_at": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_hash"?: string | null,"amount_in_usd"?: number,"buyer_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"currency"?: string,"customer_email"?: string | null,"customer_phone"?: string | null,"exchange_rate_at_purchase"?: number,"full_name"?: string | null,"id"?: string,"ip"?: unknown,"notes"?: string | null,"status"?: Database["public"]['Enums']["purchase_request_status_enum"],"total_amount"?: number,"updated_at"?: string,"user_agent"?: string | null
                  }
                  Update: {
                    "access_token_hash"?: string | null,"amount_in_usd"?: number,"buyer_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"currency"?: string,"customer_email"?: string | null,"customer_phone"?: string | null,"exchange_rate_at_purchase"?: number,"full_name"?: string | null,"id"?: string,"ip"?: unknown,"notes"?: string | null,"status"?: Database["public"]['Enums']["purchase_request_status_enum"],"total_amount"?: number,"updated_at"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_requests_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_requests_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"quarantine_records": {
                  Row: {
                    "file_version_id": string,"id": string,"notes": string | null,"quarantined_at": string,"quarantined_by": string | null,"reason": string,"released_at": string | null,"released_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "file_version_id": string,"id"?: string,"notes"?: string | null,"quarantined_at"?: string,"quarantined_by"?: string | null,"reason": string,"released_at"?: string | null,"released_by"?: string | null
                  }
                  Update: {
                    "file_version_id"?: string,"id"?: string,"notes"?: string | null,"quarantined_at"?: string,"quarantined_by"?: string | null,"reason"?: string,"released_at"?: string | null,"released_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quarantine_records_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarantine_records_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarantine_records_quarantined_by_fkey"
      columns: ["quarantined_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarantine_records_released_by_fkey"
      columns: ["released_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"redeem_attempts": {
                  Row: {
                    "code_hash_prefix": string | null,"created_at": string,"email": string | null,"id": number,"ip": unknown,"reason": string | null,"result": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash_prefix"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: number,"ip"?: unknown,"reason"?: string | null,"result": string,"user_id"?: string | null
                  }
                  Update: {
                    "code_hash_prefix"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: number,"ip"?: unknown,"reason"?: string | null,"result"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "redeem_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"restore_jobs": {
                  Row: {
                    "backup_archive_id": string,"error": string | null,"evidence": Json | null,"finished_at": string | null,"id": string,"performed_by": string | null,"started_at": string,"status": Database["public"]['Enums']["restore_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "backup_archive_id": string,"error"?: string | null,"evidence"?: Json | null,"finished_at"?: string | null,"id"?: string,"performed_by"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["restore_status_enum"]
                  }
                  Update: {
                    "backup_archive_id"?: string,"error"?: string | null,"evidence"?: Json | null,"finished_at"?: string | null,"id"?: string,"performed_by"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["restore_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "restore_jobs_backup_archive_id_fkey"
      columns: ["backup_archive_id"]
isOneToOne: false
      referencedRelation: "backup_archives"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "restore_jobs_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"retention_policies": {
                  Row: {
                    "action": string,"entity": string,"id": string,"retention_days": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string,"entity": string,"id"?: string,"retention_days": number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "action"?: string,"entity"?: string,"id"?: string,"retention_days"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "retention_policies_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "body": string | null,"buyer_id": string,"created_at": string,"delete_reason": string | null,"deleted_at": string | null,"deleted_by": string | null,"id": string,"order_item_id": string,"product_id": string,"rating": number,"seller_replied_at": string | null,"seller_replied_by": string | null,"seller_reply": string | null,"status": Database["public"]['Enums']["review_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"buyer_id": string,"created_at"?: string,"delete_reason"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"order_item_id": string,"product_id": string,"rating": number,"seller_replied_at"?: string | null,"seller_replied_by"?: string | null,"seller_reply"?: string | null,"status"?: Database["public"]['Enums']["review_status_enum"]
                  }
                  Update: {
                    "body"?: string | null,"buyer_id"?: string,"created_at"?: string,"delete_reason"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"id"?: string,"order_item_id"?: string,"product_id"?: string,"rating"?: number,"seller_replied_at"?: string | null,"seller_replied_by"?: string | null,"seller_reply"?: string | null,"status"?: Database["public"]['Enums']["review_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "reviews_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_seller_replied_by_fkey"
      columns: ["seller_replied_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_id": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_id": string,"role_id": string
                  }
                  Update: {
                    "permission_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"scan_jobs": {
                  Row: {
                    "attempts": number,"engine": string | null,"error": string | null,"file_version_id": string,"finished_at": string | null,"id": string,"queued_at": string,"result": Json | null,"started_at": string | null,"status": Database["public"]['Enums']["scan_job_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"engine"?: string | null,"error"?: string | null,"file_version_id": string,"finished_at"?: string | null,"id"?: string,"queued_at"?: string,"result"?: Json | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["scan_job_status_enum"]
                  }
                  Update: {
                    "attempts"?: number,"engine"?: string | null,"error"?: string | null,"file_version_id"?: string,"finished_at"?: string | null,"id"?: string,"queued_at"?: string,"result"?: Json | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["scan_job_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "scan_jobs_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scan_jobs_file_version_id_fkey"
      columns: ["file_version_id"]
isOneToOne: false
      referencedRelation: "file_versions_safe"
      referencedColumns: ["id"]
    }
                  ]
                },"security_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"details": Json | null,"id": string,"ip": unknown,"severity": Database["public"]['Enums']["security_severity_enum"],"type": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"details"?: Json | null,"id"?: string,"ip"?: unknown,"severity"?: Database["public"]['Enums']["security_severity_enum"],"type": string,"user_agent"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"details"?: Json | null,"id"?: string,"ip"?: unknown,"severity"?: Database["public"]['Enums']["security_severity_enum"],"type"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "security_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"security_settings": {
                  Row: {
                    "code_rate_limit_per_hour": number,"id": number,"login_rate_limit_per_hour": number,"mfa_enforced_roles": (string)[],"password_min_length": number,"session_idle_timeout_minutes": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_rate_limit_per_hour"?: number,"id"?: number,"login_rate_limit_per_hour"?: number,"mfa_enforced_roles"?: (string)[],"password_min_length"?: number,"session_idle_timeout_minutes"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "code_rate_limit_per_hour"?: number,"id"?: number,"login_rate_limit_per_hour"?: number,"mfa_enforced_roles"?: (string)[],"password_min_length"?: number,"session_idle_timeout_minutes"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "security_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_agreements": {
                  Row: {
                    "accepted_at": string,"id": string,"ip": unknown,"profile_id": string,"user_agent": string | null,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"id"?: string,"ip"?: unknown,"profile_id": string,"user_agent"?: string | null,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"id"?: string,"ip"?: unknown,"profile_id"?: string,"user_agent"?: string | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_agreements_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_applications": {
                  Row: {
                    "id": string,"notes": string | null,"profile_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["application_status_enum"],"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"notes"?: string | null,"profile_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["application_status_enum"],"submitted_at"?: string
                  }
                  Update: {
                    "id"?: string,"notes"?: string | null,"profile_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["application_status_enum"],"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_applications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_applications_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_commissions": {
                  Row: {
                    "effective_from": string,"effective_to": string | null,"id": string,"rate": number,"reference_id": string | null,"scope": Database["public"]['Enums']["commission_scope_enum"],"seller_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "effective_from"?: string,"effective_to"?: string | null,"id"?: string,"rate": number,"reference_id"?: string | null,"scope"?: Database["public"]['Enums']["commission_scope_enum"],"seller_id": string
                  }
                  Update: {
                    "effective_from"?: string,"effective_to"?: string | null,"id"?: string,"rate"?: number,"reference_id"?: string | null,"scope"?: Database["public"]['Enums']["commission_scope_enum"],"seller_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_commissions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "seller_commissions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"seller_drive_accounts": {
                  Row: {
                    "access_token_expires_at": string | null,"created_at": string,"encrypted_access_token": string | null,"encrypted_refresh_token": string | null,"google_account_email": string,"id": string,"is_default": boolean,"last_checked_at": string | null,"priority": number,"quota_total": number | null,"quota_used": number | null,"scopes": (string)[] | null,"seller_id": string,"status": Database["public"]['Enums']["drive_account_status_enum"],"store_folder_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_expires_at"?: string | null,"created_at"?: string,"encrypted_access_token"?: string | null,"encrypted_refresh_token"?: string | null,"google_account_email": string,"id"?: string,"is_default"?: boolean,"last_checked_at"?: string | null,"priority"?: number,"quota_total"?: number | null,"quota_used"?: number | null,"scopes"?: (string)[] | null,"seller_id": string,"status"?: Database["public"]['Enums']["drive_account_status_enum"],"store_folder_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_token_expires_at"?: string | null,"created_at"?: string,"encrypted_access_token"?: string | null,"encrypted_refresh_token"?: string | null,"google_account_email"?: string,"id"?: string,"is_default"?: boolean,"last_checked_at"?: string | null,"priority"?: number,"quota_total"?: number | null,"quota_used"?: number | null,"scopes"?: (string)[] | null,"seller_id"?: string,"status"?: Database["public"]['Enums']["drive_account_status_enum"],"store_folder_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_drive_accounts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "seller_drive_accounts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"seller_payouts": {
                  Row: {
                    "amount": number,"amount_in_usd": number,"currency": string,"decided_at": string | null,"decided_by": string | null,"id": string,"method": string | null,"paid_at": string | null,"reference": string | null,"requested_at": string,"seller_id": string,"status": Database["public"]['Enums']["payout_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"amount_in_usd": number,"currency"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"method"?: string | null,"paid_at"?: string | null,"reference"?: string | null,"requested_at"?: string,"seller_id": string,"status"?: Database["public"]['Enums']["payout_status_enum"]
                  }
                  Update: {
                    "amount"?: number,"amount_in_usd"?: number,"currency"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"method"?: string | null,"paid_at"?: string | null,"reference"?: string | null,"requested_at"?: string,"seller_id"?: string,"status"?: Database["public"]['Enums']["payout_status_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_payouts_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_payouts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "seller_payouts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"seller_profiles": {
                  Row: {
                    "agreement_accepted_at": string | null,"agreement_version": string | null,"approved_at": string | null,"approved_by": string | null,"avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string,"profile_id": string,"rejected_at": string | null,"rejected_by": string | null,"rejection_reason": string | null,"status": Database["public"]['Enums']["seller_status_enum"],"suspended_at": string | null,"suspended_by": string | null,"suspension_reason": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_accepted_at"?: string | null,"agreement_version"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name": string,"profile_id": string,"rejected_at"?: string | null,"rejected_by"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["seller_status_enum"],"suspended_at"?: string | null,"suspended_by"?: string | null,"suspension_reason"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "agreement_accepted_at"?: string | null,"agreement_version"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string,"profile_id"?: string,"rejected_at"?: string | null,"rejected_by"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["seller_status_enum"],"suspended_at"?: string | null,"suspended_by"?: string | null,"suspension_reason"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_profiles_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_profiles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_profiles_rejected_by_fkey"
      columns: ["rejected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_profiles_suspended_by_fkey"
      columns: ["suspended_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_wallets": {
                  Row: {
                    "balance": number,"currency": string,"id": string,"seller_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance"?: number,"currency"?: string,"id"?: string,"seller_id": string,"updated_at"?: string
                  }
                  Update: {
                    "balance"?: number,"currency"?: string,"id"?: string,"seller_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_wallets_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "seller_wallets_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"store_members": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"profile_id": string,"role_id": string,"status": Database["public"]['Enums']["member_status_enum"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"profile_id": string,"role_id": string,"status"?: Database["public"]['Enums']["member_status_enum"],"updated_at"?: string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"profile_id"?: string,"role_id"?: string,"status"?: Database["public"]['Enums']["member_status_enum"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "store_members_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "store_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "store_members_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"is_internal": boolean,"sender_id": string | null,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"is_internal"?: boolean,"sender_id"?: string | null,"ticket_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"is_internal"?: boolean,"sender_id"?: string | null,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "created_at": string,"id": string,"order_item_id": string | null,"owner_id": string,"product_id": string | null,"review_id": string | null,"status": Database["public"]['Enums']["ticket_status_enum"],"subject": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"order_item_id"?: string | null,"owner_id": string,"product_id"?: string | null,"review_id"?: string | null,"status"?: Database["public"]['Enums']["ticket_status_enum"],"subject": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"order_item_id"?: string | null,"owner_id"?: string,"product_id"?: string | null,"review_id"?: string | null,"status"?: Database["public"]['Enums']["ticket_status_enum"],"subject"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "support_tickets_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "seller_reviews_view"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "id": string,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"slug": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"upload_sessions": {
                  Row: {
                    "bytes_uploaded": number,"checksum_sha256": string | null,"completed_at": string | null,"created_at": string,"display_name": string | null,"drive_account_id": string | null,"error": string | null,"expires_at": string | null,"extension": string | null,"file_id": string | null,"id": string,"mime": string | null,"original_name": string | null,"provider": Database["public"]['Enums']["storage_provider_enum"],"provider_upload_url": string | null,"seller_id": string,"status": Database["public"]['Enums']["upload_session_status_enum"],"total_bytes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes_uploaded"?: number,"checksum_sha256"?: string | null,"completed_at"?: string | null,"created_at"?: string,"display_name"?: string | null,"drive_account_id"?: string | null,"error"?: string | null,"expires_at"?: string | null,"extension"?: string | null,"file_id"?: string | null,"id"?: string,"mime"?: string | null,"original_name"?: string | null,"provider": Database["public"]['Enums']["storage_provider_enum"],"provider_upload_url"?: string | null,"seller_id": string,"status"?: Database["public"]['Enums']["upload_session_status_enum"],"total_bytes"?: number | null
                  }
                  Update: {
                    "bytes_uploaded"?: number,"checksum_sha256"?: string | null,"completed_at"?: string | null,"created_at"?: string,"display_name"?: string | null,"drive_account_id"?: string | null,"error"?: string | null,"expires_at"?: string | null,"extension"?: string | null,"file_id"?: string | null,"id"?: string,"mime"?: string | null,"original_name"?: string | null,"provider"?: Database["public"]['Enums']["storage_provider_enum"],"provider_upload_url"?: string | null,"seller_id"?: string,"status"?: Database["public"]['Enums']["upload_session_status_enum"],"total_bytes"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "upload_sessions_drive_account_id_fkey"
      columns: ["drive_account_id"]
isOneToOne: false
      referencedRelation: "seller_drive_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_drive_account_id_fkey"
      columns: ["drive_account_id"]
isOneToOne: false
      referencedRelation: "seller_drive_accounts_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "upload_sessions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"watermark_settings": {
                  Row: {
                    "apply_to_delivered_files": boolean,"apply_to_previews_only": boolean,"direction": Database["public"]['Enums']["watermark_direction_enum"],"id": number,"opacity_level": Database["public"]['Enums']["watermark_opacity_enum"],"text_template": string,"updated_at": string,"updated_by": string | null,"video_style": Database["public"]['Enums']["watermark_video_style_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_to_delivered_files"?: boolean,"apply_to_previews_only"?: boolean,"direction"?: Database["public"]['Enums']["watermark_direction_enum"],"id"?: number,"opacity_level"?: Database["public"]['Enums']["watermark_opacity_enum"],"text_template"?: string,"updated_at"?: string,"updated_by"?: string | null,"video_style"?: Database["public"]['Enums']["watermark_video_style_enum"]
                  }
                  Update: {
                    "apply_to_delivered_files"?: boolean,"apply_to_previews_only"?: boolean,"direction"?: Database["public"]['Enums']["watermark_direction_enum"],"id"?: number,"opacity_level"?: Database["public"]['Enums']["watermark_opacity_enum"],"text_template"?: string,"updated_at"?: string,"updated_by"?: string | null,"video_style"?: Database["public"]['Enums']["watermark_video_style_enum"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "watermark_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "buyer_codes_full": {
                  Row: {
                    "buyer_id": string | null,"code_id": string,"code_prefix": string,"code_status": Database["public"]['Enums']["code_status_enum"],"customer_email": string | null,"delivered_at": string | null,"expires_at": string,"issued_at": string,"order_item_id": string,"product_id": string,"product_slug": string,"product_title": string,"purchase_request_id": string,"redeemed_at": string | null,"replacement_for_code_id": string | null,"session_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "purchase_codes_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_requests_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_codes_view": {
                  Row: {
                    "code_prefix": string,"delivered_at": string | null,"expires_at": string,"id": string,"issued_at": string,"order_item_id": string,"redeemed_at": string | null,"replacement_for_code_id": string | null,"status": Database["public"]['Enums']["code_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                           "code_prefix"?: string | null,"delivered_at"?: string | null,"expires_at"?: string | null,"id"?: string | null,"issued_at"?: string | null,"order_item_id"?: string | null,"redeemed_at"?: string | null,"replacement_for_code_id"?: string | null,"status"?: Database["public"]['Enums']["code_status_enum"] | null
                         }
                        Update: {
                           "code_prefix"?: string | null,"delivered_at"?: string | null,"expires_at"?: string | null,"id"?: string | null,"issued_at"?: string | null,"order_item_id"?: string | null,"redeemed_at"?: string | null,"replacement_for_code_id"?: string | null,"status"?: Database["public"]['Enums']["code_status_enum"] | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "purchase_codes_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["order_item_id"]
    },{
      foreignKeyName: "purchase_codes_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "purchase_codes_replacement_for_code_id_fkey"
      columns: ["replacement_for_code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_compensation_view": {
                  Row: {
                    "admin_reason": string | null,"approved_session_id": string | null,"code_id": string,"decided_at": string | null,"id": string,"original_session_id": string | null,"reason": string,"requested_at": string,"sequence_number": number,"status": Database["public"]['Enums']["compensation_status_enum"]
                  }
                  ComputedFields: never
                  Insert: {
                           "admin_reason"?: never,"approved_session_id"?: string | null,"code_id"?: string | null,"decided_at"?: string | null,"id"?: string | null,"original_session_id"?: string | null,"reason"?: string | null,"requested_at"?: string | null,"sequence_number"?: number | null,"status"?: Database["public"]['Enums']["compensation_status_enum"] | null
                         }
                        Update: {
                           "admin_reason"?: never,"approved_session_id"?: string | null,"code_id"?: string | null,"decided_at"?: string | null,"id"?: string | null,"original_session_id"?: string | null,"reason"?: string | null,"requested_at"?: string | null,"sequence_number"?: number | null,"status"?: Database["public"]['Enums']["compensation_status_enum"] | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "compensation_requests_approved_session_id_fkey"
      columns: ["approved_session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "compensation_requests_approved_session_id_fkey"
      columns: ["approved_session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_codes_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["code_id"]
    },{
      foreignKeyName: "compensation_requests_code_id_fkey"
      columns: ["code_id"]
isOneToOne: false
      referencedRelation: "purchase_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compensation_requests_original_session_id_fkey"
      columns: ["original_session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "compensation_requests_original_session_id_fkey"
      columns: ["original_session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_orders_view": {
                  Row: {
                    "amount_in_usd": number,"buyer_id": string | null,"created_at": string,"currency": string,"customer_email": string | null,"customer_phone": string | null,"order_id": string | null,"order_status": Database["public"]['Enums']["order_status_enum"] | null,"purchase_request_id": string,"status": Database["public"]['Enums']["purchase_request_status_enum"],"total_amount": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "purchase_requests_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_sessions_full": {
                  Row: {
                    "attempt_consumed": boolean,"buyer_id": string | null,"code_id": string,"code_prefix": string,"customer_email": string | null,"ended_at": string | null,"expires_at": string,"is_compensation": boolean,"order_item_id": string,"parent_session_id": string | null,"product_id": string,"product_slug": string,"product_title": string,"purchase_request_id": string,"session_id": string,"started_at": string,"status": Database["public"]['Enums']["download_session_status_enum"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "download_sessions_parent_session_id_fkey"
      columns: ["parent_session_id"]
isOneToOne: false
      referencedRelation: "buyer_sessions_full"
      referencedColumns: ["session_id"]
    },{
      foreignKeyName: "download_sessions_parent_session_id_fkey"
      columns: ["parent_session_id"]
isOneToOne: false
      referencedRelation: "download_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_requests_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"file_versions_safe": {
                  Row: {
                    "checksum_sha256": string | null,"created_at": string,"extension": string | null,"file_id": string,"id": string,"mime": string | null,"scan_status": Database["public"]['Enums']["file_scan_status_enum"],"size_bytes": number,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                           "checksum_sha256"?: string | null,"created_at"?: string | null,"extension"?: string | null,"file_id"?: string | null,"id"?: string | null,"mime"?: string | null,"scan_status"?: Database["public"]['Enums']["file_scan_status_enum"] | null,"size_bytes"?: number | null,"version_number"?: number | null
                         }
                        Update: {
                           "checksum_sha256"?: string | null,"created_at"?: string | null,"extension"?: string | null,"file_id"?: string | null,"id"?: string | null,"mime"?: string | null,"scan_status"?: Database["public"]['Enums']["file_scan_status_enum"] | null,"size_bytes"?: number | null,"version_number"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "file_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files_safe"
      referencedColumns: ["id"]
    }
                  ]
                },"files_safe": {
                  Row: {
                    "created_at": string,"display_name": string | null,"extension": string | null,"id": string,"mime": string | null,"original_name": string,"seller_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"display_name"?: string | null,"extension"?: string | null,"id"?: string | null,"mime"?: string | null,"original_name"?: string | null,"seller_id"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"display_name"?: string | null,"extension"?: string | null,"id"?: string | null,"mime"?: string | null,"original_name"?: string | null,"seller_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "files_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "files_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"seller_drive_accounts_safe": {
                  Row: {
                    "created_at": string,"google_account_email": string,"id": string,"is_default": boolean,"last_checked_at": string | null,"priority": number,"quota_total": number | null,"quota_used": number | null,"scopes": (string)[] | null,"seller_id": string,"status": Database["public"]['Enums']["drive_account_status_enum"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"google_account_email"?: string | null,"id"?: string | null,"is_default"?: boolean | null,"last_checked_at"?: string | null,"priority"?: number | null,"quota_total"?: number | null,"quota_used"?: number | null,"scopes"?: (string)[] | null,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["drive_account_status_enum"] | null,"updated_at"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"google_account_email"?: string | null,"id"?: string | null,"is_default"?: boolean | null,"last_checked_at"?: string | null,"priority"?: number | null,"quota_total"?: number | null,"quota_used"?: number | null,"scopes"?: (string)[] | null,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["drive_account_status_enum"] | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "seller_drive_accounts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "seller_drive_accounts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"seller_public_view": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"display_name": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_url"?: string | null,"bio"?: string | null,"display_name"?: string | null,"profile_id"?: string | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"bio"?: string | null,"display_name"?: string | null,"profile_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "seller_profiles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_reviews_view": {
                  Row: {
                    "body": string | null,"buyer_id": string,"created_at": string,"delete_reason": string | null,"deleted_by": string | null,"id": string,"product_id": string,"product_slug": string,"product_title": string,"rating": number,"seller_id": string,"seller_replied_at": string | null,"seller_reply": string | null,"status": Database["public"]['Enums']["review_status_enum"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "products_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "reviews_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "storefront_products"
      referencedColumns: ["id"]
    }
                  ]
                },"storefront_categories": {
                  Row: {
                    "cover_image_url": string | null,"id": string,"name": string,"parent_id": string | null,"product_count": number | null,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                           "cover_image_url"?: string | null,"id"?: string | null,"name"?: string | null,"parent_id"?: string | null,"product_count"?: never,"slug"?: string | null,"sort_order"?: number | null
                         }
                        Update: {
                           "cover_image_url"?: string | null,"id"?: string | null,"name"?: string | null,"parent_id"?: string | null,"product_count"?: never,"slug"?: string | null,"sort_order"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "storefront_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "storefront_top_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"storefront_products": {
                  Row: {
                    "category_id": string | null,"category_name": string | null,"category_slug": string | null,"cover_image_url": string | null,"id": string,"price_amount": number,"price_currency": string,"published_at": string | null,"rating_avg": number | null,"rating_count": number | null,"search_text": string | null,"seller_display_name": string,"seller_id": string,"short_description": string | null,"slug": string,"title": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "storefront_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "storefront_top_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "products_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"storefront_top_categories": {
                  Row: {
                    "id": string,"name": string,"product_count": number | null,"slug": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"upload_sessions_safe": {
                  Row: {
                    "bytes_uploaded": number,"completed_at": string | null,"created_at": string,"display_name": string | null,"drive_account_id": string | null,"expires_at": string | null,"extension": string | null,"file_id": string | null,"id": string,"mime": string | null,"original_name": string | null,"provider": Database["public"]['Enums']["storage_provider_enum"],"seller_id": string,"status": Database["public"]['Enums']["upload_session_status_enum"],"total_bytes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "bytes_uploaded"?: number | null,"completed_at"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"drive_account_id"?: string | null,"expires_at"?: string | null,"extension"?: string | null,"file_id"?: string | null,"id"?: string | null,"mime"?: string | null,"original_name"?: string | null,"provider"?: Database["public"]['Enums']["storage_provider_enum"] | null,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["upload_session_status_enum"] | null,"total_bytes"?: number | null
                         }
                        Update: {
                           "bytes_uploaded"?: number | null,"completed_at"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"drive_account_id"?: string | null,"expires_at"?: string | null,"extension"?: string | null,"file_id"?: string | null,"id"?: string | null,"mime"?: string | null,"original_name"?: string | null,"provider"?: Database["public"]['Enums']["storage_provider_enum"] | null,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["upload_session_status_enum"] | null,"total_bytes"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "upload_sessions_drive_account_id_fkey"
      columns: ["drive_account_id"]
isOneToOne: false
      referencedRelation: "seller_drive_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_drive_account_id_fkey"
      columns: ["drive_account_id"]
isOneToOne: false
      referencedRelation: "seller_drive_accounts_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files_safe"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_sessions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "upload_sessions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_public_view"
      referencedColumns: ["profile_id"]
    }
                  ]
                }
          }
          Functions: {
            "acquire_concurrency_lock":
{ Args: { "p_key": string,"p_ttl_seconds"?: number }; Returns: {
              "acquired": boolean,"owner_token": string,"retry_after_seconds": number
            }[]
                           },
"add_file_to_version":
{ Args: { "p_file_version_id": string,"p_version_id": string }; Returns: string
                           },
"adjust_wallet":
{ Args: { "p_amount": number,"p_reason": string,"p_wallet_id": string }; Returns: undefined
                           },
"admin_publish_product":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"allowed_currencies":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"approve_compensation":
{ Args: { "p_reason": string,"p_request_id": string }; Returns: string
                           },
"approve_payout":
{ Args: { "p_payout_id": string }; Returns: undefined
                           },
"approve_purchase_request":
{ Args: { "p_request_id": string }; Returns: Json
                           } |
{ Args: { "p_pepper": string,"p_request_id": string }; Returns: Json
                           } |
{ Args: { "p_attestation": Json,"p_pepper": string,"p_request_id": string }; Returns: Json
                           },
"approve_seller":
{ Args: { "p_seller_id": string }; Returns: undefined
                           },
"buyer_attempts_remaining":
{ Args: { "p_order_item_id": string }; Returns: {
              "max": number,"remaining": number,"used": number
            }[]
                           },
"buyer_dashboard_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"buyer_order_detail":
{ Args: { "p_request_id": string }; Returns: Json
                           },
"buyer_orders_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount_in_usd": number,"code_count": number,"created_at": string,"currency": string,"product_titles": string,"purchase_request_id": string,"status": Database["public"]['Enums']["purchase_request_status_enum"],"total_amount": number
            }[]
                           },
"buyer_owns_code":
{ Args: { "p_code_id": string }; Returns: boolean
                           },
"buyer_owns_order_item":
{ Args: { "p_order_item_id": string }; Returns: boolean
                           },
"buyer_owns_purchase":
{ Args: { "p_purchase_id": string }; Returns: boolean
                           },
"buyer_owns_session":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"can_current_user_review":
{ Args: { "p_product_id": string }; Returns: {
              "can_review": boolean,"order_item_id": string,"reason": string
            }[]
                           },
"category_would_create_cycle":
{ Args: { "p_category_id": string,"p_new_parent_id": string }; Returns: boolean
                           },
"change_staff_role":
{ Args: { "p_new_role_code": string,"p_profile_id": string }; Returns: undefined
                           },
"check_redeem_rate_limit":
{ Args: { "p_ip": unknown,"p_user_id": string }; Returns: {
              "allowed": boolean,"reason": string,"retry_after_seconds": number
            }[]
                           },
"claim_download_token":
{ Args: { "p_token_hash": string }; Returns: undefined
                           },
"claim_email_outbox":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"html_body": string | null,
"id": string,
"last_error": string | null,
"max_attempts": number,
"provider_message_id": string | null,
"reference_id": string | null,
"reference_type": string | null,
"sent_at": string | null,
"status": Database["public"]['Enums']["email_outbox_status_enum"],
"subject": string,
"template": string,
"text_body": string,
"to_email": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "email_outbox"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_preview_jobs":
{ Args: { "p_limit"?: number }; Returns: {
              "drive_account_id": string,"extension": string,"file_id": string,"file_version_id": string,"mime": string,"preview_id": string,"provider_file_id": string,"seller_id": string
            }[]
                           },
"claim_scan_jobs":
{ Args: { "p_limit"?: number }; Returns: {
              "drive_account_id": string,"extension": string,"file_id": string,"file_version_id": string,"job_id": string,"mime": string,"provider_file_id": string,"seller_id": string,"storage_location_id": string
            }[]
                           },
"code_buyer_id":
{ Args: { "p_code_id": string }; Returns: string
                           },
"code_is_delivered":
{ Args: { "p_code_id": string }; Returns: boolean
                           },
"complete_backup_job":
{ Args: { "p_checksum": string,"p_job_id": string,"p_size_bytes": number,"p_storage_location": string }; Returns: string
                           } |
{ Args: { "p_checksum": string,"p_job_id": string,"p_row_counts": Json,"p_size_bytes": number,"p_source_pg_version": string,"p_storage_location": string }; Returns: string
                           },
"complete_scan_pass":
{ Args: { "p_file_version_id": string }; Returns: undefined
                           },
"complete_upload_session":
{ Args: { "p_checksum": string,"p_provider_file_id": string,"p_session_id": string,"p_size_bytes": number }; Returns: Json
                           },
"confirm_code_delivery":
{ Args: { "p_code_id": string,"p_method": Database["public"]['Enums']["delivery_confirmation_method_enum"] }; Returns: undefined
                           },
"consume_plaintext_handoff":
{ Args: { "p_code_id": string }; Returns: string
                           },
"consume_rate_limit":
{ Args: { "p_bucket_key": string,"p_ip"?: unknown,"p_limit": number,"p_scope": string,"p_window_seconds": number }; Returns: {
              "allowed": boolean,"remaining": number,"retry_after_seconds": number
            }[]
                           },
"create_compensation_session":
{ Args: { "p_code_id": string,"p_reason": string }; Returns: string
                           },
"create_purchase_request":
{ Args: { "p_access_token_hash": string,"p_buyer_id"?: string,"p_email": string,"p_full_name": string,"p_ip": unknown,"p_notes": string,"p_phone": string,"p_product_id": string,"p_user_agent": string }; Returns: Json
                           },
"credit_seller_wallet_for_order_item":
{ Args: { "p_commission": number,"p_currency": string,"p_gross": number,"p_net": number,"p_order_item_id": string,"p_seller_id": string }; Returns: string
                           },
"current_account_type":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_category_safe":
{ Args: { "p_category_id": string,"p_fallback_category_id"?: string,"p_mode": string }; Returns: Json
                           },
"delete_review":
{ Args: { "p_reason": string,"p_review_id": string }; Returns: undefined
                           },
"delete_review_from_ticket":
{ Args: { "p_reason": string,"p_review_id": string,"p_ticket_id": string }; Returns: undefined
                           },
"download_session_owned_by_current_user":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"enqueue_email":
{ Args: { "p_html_body"?: string,"p_reference_id"?: string,"p_reference_type"?: string,"p_subject": string,"p_template"?: string,"p_text_body": string,"p_to_email": string }; Returns: string
                           },
"expire_partial_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"extend_session":
{ Args: { "p_extra_hours": number,"p_reason": string,"p_session_id": string }; Returns: undefined
                           },
"fail_backup_job":
{ Args: { "p_error": string,"p_job_id": string }; Returns: undefined
                           },
"fail_preview":
{ Args: { "p_preview_id": string,"p_reason": string }; Returns: undefined
                           },
"finalize_preview":
{ Args: { "p_preview_id": string,"p_public_url": string,"p_storage_path": string }; Returns: undefined
                           },
"get_usd_rate":
{ Args: { "p_currency": string }; Returns: number
                           },
"grant_member_permission":
{ Args: { "p_expires_at"?: string,"p_permission_code": string,"p_profile_id": string }; Returns: undefined
                           },
"invite_staff":
{ Args: { "p_email": string,"p_role_code": string }; Returns: string
                           },
"is_active_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin_or_above":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_approved_seller":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_backup_due":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_restore_test_due":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_seller_profile_approved":
{ Args: { "p_seller_id": string }; Returns: boolean
                           },
"is_session_fully_delivered":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"is_super_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"issue_attempt_exception":
{ Args: { "p_code_id": string,"p_granted": number,"p_reason": string }; Returns: string
                           },
"issue_replacement_code":
{ Args: { "p_original_code_id": string,"p_reason": string }; Returns: string
                           } |
{ Args: { "p_original_code_id": string,"p_pepper": string,"p_reason": string }; Returns: string
                           },
"log_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_before"?: Json,"p_entity_id"?: string,"p_entity_type"?: string,"p_ip"?: unknown,"p_reason"?: string,"p_request_id"?: string,"p_user_agent"?: string }; Returns: undefined
                           },
"log_redeem_attempt":
{ Args: { "p_code_hash_prefix"?: string,"p_email": string,"p_ip": unknown,"p_reason"?: string,"p_result": string,"p_user_id": string }; Returns: undefined
                           },
"mark_all_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_download_token_completed":
{ Args: { "p_token_hash": string }; Returns: undefined
                           },
"mark_email_failed":
{ Args: { "p_error": string,"p_id": string }; Returns: undefined
                           },
"mark_email_sent":
{ Args: { "p_id": string,"p_provider_id"?: string }; Returns: undefined
                           },
"mark_payout_paid":
{ Args: { "p_payout_id": string,"p_reference": string }; Returns: undefined
                           },
"mark_session_completed":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"min_product_price":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"normalize_arabic":
{ Args: { "txt": string }; Returns: string
                           },
"notify_staff_with_permission":
{ Args: { "p_body": string,"p_category": string,"p_data"?: Json,"p_exclude_user"?: string,"p_link": string,"p_permission": string,"p_title": string,"p_type": string }; Returns: number
                           },
"pick_drive_account":
{ Args: { "p_seller_id": string,"p_size_bytes": number }; Returns: string
                           },
"publish_product_version":
{ Args: { "p_version_id": string }; Returns: undefined
                           },
"purchase_request_forensics":
{ Args: { "p_request_id": string }; Returns: {
              "access_token_hash": string,"ip": unknown,"user_agent": string
            }[]
                           },
"quarantine_file":
{ Args: { "p_file_version_id": string,"p_reason": string }; Returns: undefined
                           },
"record_backup_restore_evidence":
{ Args: { "p_archive_id": string,"p_restore_prereqs": Json,"p_storage_evidence": Json }; Returns: undefined
                           },
"record_restore_verification":
{ Args: { "p_archive_id": string,"p_error"?: string,"p_performed_by"?: string,"p_status": Database["public"]['Enums']["restore_status_enum"] }; Returns: string
                           } |
{ Args: { "p_archive_id": string,"p_error": string,"p_evidence": Json,"p_performed_by": string,"p_status": Database["public"]['Enums']["restore_status_enum"] }; Returns: string
                           },
"record_successful_attempt":
{ Args: { "p_order_item_id": string,"p_session_id": string,"p_type": Database["public"]['Enums']["download_attempt_type_enum"] }; Returns: number
                           },
"redeem_code":
{ Args: { "p_code_id": string }; Returns: string
                           },
"refresh_product_rating":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"register_download_token":
{ Args: { "p_expires_at": string,"p_file_version_id": string,"p_scope": Database["public"]['Enums']["download_token_scope_enum"],"p_session_id": string,"p_token_hash": string }; Returns: undefined
                           },
"register_drive_file":
{ Args: { "p_audit_action": string,"p_checksum": string,"p_drive_account_id": string,"p_extension": string,"p_mime": string,"p_original_name": string,"p_provider_file_id": string,"p_seller_id": string,"p_size_bytes": number }; Returns: Json
                           },
"reject_compensation":
{ Args: { "p_admin_reason": string,"p_request_id": string }; Returns: undefined
                           },
"reject_payout":
{ Args: { "p_payout_id": string,"p_reason": string }; Returns: undefined
                           },
"reject_purchase_request":
{ Args: { "p_reason": string,"p_request_id": string }; Returns: undefined
                           },
"reject_seller":
{ Args: { "p_reason": string,"p_seller_id": string }; Returns: undefined
                           },
"release_concurrency_lock":
{ Args: { "p_key": string,"p_owner_token": string }; Returns: undefined
                           },
"release_from_quarantine":
{ Args: { "p_file_version_id": string,"p_reason": string }; Returns: undefined
                           },
"remove_staff_member":
{ Args: { "p_profile_id": string }; Returns: undefined
                           },
"reopen_product":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"reorder_categories":
{ Args: { "p_order": Json }; Returns: undefined
                           },
"request_payout":
{ Args: { "p_amount": number,"p_currency": string,"p_method": string }; Returns: string
                           },
"resolve_effective_commission_rate":
{ Args: { "p_category_id"?: string,"p_seller_id": string }; Returns: number
                           },
"resolve_report":
{ Args: { "p_note": string,"p_report_id": string,"p_resolution": Database["public"]['Enums']["report_status_enum"] }; Returns: undefined
                           },
"revoke_code_before_delivery":
{ Args: { "p_code_id": string,"p_reason": string }; Returns: undefined
                           },
"revoke_member_permission":
{ Args: { "p_permission_code": string,"p_profile_id": string }; Returns: undefined
                           },
"revoke_session_before_delivery":
{ Args: { "p_reason": string,"p_session_id": string }; Returns: undefined
                           },
"revoke_staff":
{ Args: { "p_profile_id": string }; Returns: undefined
                           },
"search_storefront":
{ Args: { "p_category_slug"?: string,"p_limit"?: number,"p_max_price"?: number,"p_min_price"?: number,"p_offset"?: number,"p_query"?: string,"p_seller_id"?: string,"p_sort"?: string }; Returns: {
              "category_name": string,"category_slug": string,"cover_image_url": string,"id": string,"price_amount": number,"price_currency": string,"published_at": string,"rating_avg": number,"rating_count": number,"seller_display_name": string,"seller_id": string,"short_description": string,"slug": string,"title": string,"total_count": number
            }[]
                           },
"seller_order_detail":
{ Args: { "p_order_item_id": string }; Returns: Json
                           },
"seller_orders":
{ Args: { "p_from"?: string,"p_limit"?: number,"p_offset"?: number,"p_product_id"?: string,"p_status"?: string,"p_to"?: string }; Returns: {
              "attempts_max": number,"attempts_used": number,"buyer_masked": string,"code_expires_at": string,"code_prefix": string,"code_status": string,"commission_rate": number,"currency": string,"net_amount": number,"order_item_id": string,"ordered_at": string,"price": number,"product_id": string,"product_slug": string,"product_title": string,"session_status": string,"total_count": number
            }[]
                           },
"seller_owns_file":
{ Args: { "p_file_id": string }; Returns: boolean
                           },
"seller_owns_product":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"seller_review_stats":
{ Args: { "p_seller_id"?: string }; Returns: {
              "avg_rating": number,"product_id": string,"product_title": string,"r1": number,"r2": number,"r3": number,"r4": number,"r5": number,"replied_count": number,"total_reviews": number
            }[]
                           },
"seller_sales_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"session_has_started_delivery":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"set_category_parent":
{ Args: { "p_category_id": string,"p_parent_id": string }; Returns: undefined
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"staff_has":
{ Args: { "perm": string }; Returns: boolean
                           },
"start_backup_job":
{ Args: { "p_triggered_by"?: string,"p_type"?: Database["public"]['Enums']["backup_job_type_enum"] }; Returns: string
                           },
"suspend_seller":
{ Args: { "p_reason": string,"p_seller_id": string }; Returns: undefined
                           },
"track_purchase_by_token":
{ Args: { "p_token_hash": string }; Returns: {
              "created_at": string,"currency": string,"has_codes": boolean,"product_slug": string,"product_title": string,"request_id": string,"short_ref": string,"status": Database["public"]['Enums']["purchase_request_status_enum"],"total_amount": number
            }[]
                           },
"trigger_manual_backup":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"unpublish_product":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"update_backup_settings":
{ Args: { "p_include_files": boolean,"p_manual_enabled": boolean,"p_restore_test_frequency_days": number,"p_retention_days": number,"p_schedule": Database["public"]['Enums']["backup_schedule_enum"] }; Returns: undefined
                           },
"update_drive_quota":
{ Args: { "p_account_id": string,"p_total": number,"p_used": number }; Returns: undefined
                           },
"validate_version_publishable":
{ Args: { "p_version_id": string }; Returns: undefined
                           },
"verified_email_owns":
{ Args: { "p_email": string }; Returns: boolean
                           }
          }
          Enums: {
            "account_type_enum": "buyer"|"seller"|"staff","application_status_enum": "submitted"|"under_review"|"approved"|"rejected"|"withdrawn","auth_provider_enum": "google"|"password"|"both","backup_job_status_enum": "running"|"completed"|"failed","backup_job_type_enum": "auto"|"manual","backup_schedule_enum": "daily"|"weekly"|"manual_only","backup_storage_provider_enum": "r2"|"s3"|"admin_server","code_status_enum": "issued"|"delivered"|"redeemed"|"expired"|"revoked","commission_scope_enum": "global"|"product_type"|"category","compensation_status_enum": "pending"|"approved"|"rejected"|"fulfilled"|"cancelled","delivery_channel_enum": "email"|"sms"|"manual","delivery_confirmation_method_enum": "auto"|"manual","delivery_result_enum": "sent"|"failed"|"skipped","download_attempt_type_enum": "zip"|"single_files","download_delivery_type_enum": "single"|"zip","download_session_status_enum": "active"|"completed"|"expired"|"expired_partial"|"exhausted"|"compensation_pending"|"compensation_active"|"revoked","download_token_scope_enum": "single"|"zip","drive_account_status_enum": "active"|"revoked"|"quota_exceeded","email_outbox_status_enum": "queued"|"sending"|"sent"|"failed","exception_status_enum": "pending"|"approved"|"rejected"|"fulfilled","file_scan_status_enum": "uploading"|"uploaded"|"scanning"|"quarantined"|"processing"|"ready"|"failed"|"deleted"|"backup_only","member_status_enum": "active"|"suspended"|"revoked","order_status_enum": "created"|"paid"|"fulfilled"|"cancelled","payment_status_enum": "pending"|"succeeded"|"failed"|"refunded","payout_status_enum": "requested"|"approved"|"rejected"|"paid","preview_quality_enum": "low"|"medium"|"high","preview_type_enum": "image"|"video"|"document","product_status_enum": "draft"|"published"|"paused"|"suspended"|"rejected"|"deleted"|"archived","purchase_request_status_enum": "created"|"pending"|"approved"|"rejected"|"cancelled"|"completed","report_status_enum": "open"|"resolved"|"dismissed","restore_status_enum": "running"|"completed"|"failed","review_status_enum": "published"|"deleted","scan_job_status_enum": "queued"|"running"|"passed"|"failed"|"quarantined","security_severity_enum": "low"|"medium"|"high"|"critical","seller_status_enum": "pending"|"approved"|"rejected"|"suspended","storage_provider_enum": "google_drive"|"r2"|"s3","ticket_status_enum": "open"|"pending"|"closed","upload_session_status_enum": "initiated"|"uploading"|"completed"|"aborted"|"expired"|"completing","user_status_enum": "active"|"suspended"|"deleted","version_status_enum": "draft"|"published"|"archived","wallet_tx_type_enum": "earning"|"commission"|"payout"|"adjustment","watermark_direction_enum": "diagonal"|"horizontal","watermark_opacity_enum": "low"|"medium"|"high","watermark_video_style_enum": "static"|"periodic"|"both"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"storage": {
          Tables: {
            "bucket_lifecycle_states": {
                  Row: {
                    "bucket_id": string,"claim_id": string | null,"claim_until": string | null,"continuation": Json | null,"failure_count": number,"generation": string | null,"last_completed_at": string | null,"last_error": Json | null,"last_result": Json | null,"last_started_at": string | null,"last_success_at": string | null,"next_run_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"claim_id"?: string | null,"claim_until"?: string | null,"continuation"?: Json | null,"failure_count"?: number,"generation"?: string | null,"last_completed_at"?: string | null,"last_error"?: Json | null,"last_result"?: Json | null,"last_started_at"?: string | null,"last_success_at"?: string | null,"next_run_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "bucket_id"?: string,"claim_id"?: string | null,"claim_until"?: string | null,"continuation"?: Json | null,"failure_count"?: number,"generation"?: string | null,"last_completed_at"?: string | null,"last_error"?: Json | null,"last_result"?: Json | null,"last_started_at"?: string | null,"last_success_at"?: string | null,"next_run_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bucket_lifecycle_states_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: true
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    }
                  ]
                },"buckets": {
                  Row: {
                    "allowed_mime_types": (string)[] | null,"avif_autodetection": boolean | null,"created_at": string | null,"file_size_limit": number | null,"id": string,"lifecycle_configuration": Json | null,"lifecycle_configuration_generation": string | null,"name": string,"owner": string | null,"owner_id": string | null,"public": boolean | null,"type": Database["storage"]['Enums']["buckettype"],"updated_at": string | null,"versioning_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_mime_types"?: (string)[] | null,"avif_autodetection"?: boolean | null,"created_at"?: string | null,"file_size_limit"?: number | null,"id": string,"lifecycle_configuration"?: Json | null,"lifecycle_configuration_generation"?: string | null,"name": string,"owner"?: string | null,"owner_id"?: string | null,"public"?: boolean | null,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string | null,"versioning_status"?: string
                  }
                  Update: {
                    "allowed_mime_types"?: (string)[] | null,"avif_autodetection"?: boolean | null,"created_at"?: string | null,"file_size_limit"?: number | null,"id"?: string,"lifecycle_configuration"?: Json | null,"lifecycle_configuration_generation"?: string | null,"name"?: string,"owner"?: string | null,"owner_id"?: string | null,"public"?: boolean | null,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string | null,"versioning_status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"buckets_analytics": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"format": string,"id": string,"name": string,"type": Database["storage"]['Enums']["buckettype"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"format"?: string,"id"?: string,"name": string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"format"?: string,"id"?: string,"name"?: string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"buckets_vectors": {
                  Row: {
                    "created_at": string,"id": string,"type": Database["storage"]['Enums']["buckettype"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"iceberg_namespaces": {
                  Row: {
                    "bucket_name": string,"catalog_id": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_name": string,"catalog_id": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "bucket_name"?: string,"catalog_id"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
      columns: ["catalog_id"]
isOneToOne: false
      referencedRelation: "buckets_analytics"
      referencedColumns: ["id"]
    }
                  ]
                },"iceberg_tables": {
                  Row: {
                    "bucket_name": string,"catalog_id": string,"created_at": string,"id": string,"location": string,"name": string,"namespace_id": string,"remote_table_id": string | null,"shard_id": string | null,"shard_key": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_name": string,"catalog_id": string,"created_at"?: string,"id"?: string,"location": string,"name": string,"namespace_id": string,"remote_table_id"?: string | null,"shard_id"?: string | null,"shard_key"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "bucket_name"?: string,"catalog_id"?: string,"created_at"?: string,"id"?: string,"location"?: string,"name"?: string,"namespace_id"?: string,"remote_table_id"?: string | null,"shard_id"?: string | null,"shard_key"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "iceberg_tables_catalog_id_fkey"
      columns: ["catalog_id"]
isOneToOne: false
      referencedRelation: "buckets_analytics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "iceberg_tables_namespace_id_fkey"
      columns: ["namespace_id"]
isOneToOne: false
      referencedRelation: "iceberg_namespaces"
      referencedColumns: ["id"]
    }
                  ]
                },"lifecycle_abandoned_artifacts": {
                  Row: {
                    "attempted_at": string,"bucket_id": string,"key": string,"name": string,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"bucket_id": string,"key": string,"name": string,"version"?: string | null
                  }
                  Update: {
                    "attempted_at"?: string,"bucket_id"?: string,"key"?: string,"name"?: string,"version"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"migrations": {
                  Row: {
                    "executed_at": string | null,"hash": string,"id": number,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "executed_at"?: string | null,"hash": string,"id": number,"name": string
                  }
                  Update: {
                    "executed_at"?: string | null,"hash"?: string,"id"?: number,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"objects": {
                  Row: {
                    "archived_at": string | null,"bucket_id": string | null,"created_at": string | null,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"last_accessed_at": string | null,"metadata": Json | null,"name": string | null,"owner": string | null,"owner_id": string | null,"path_tokens": (string)[] | null,"updated_at": string | null,"user_metadata": Json | null,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"bucket_id"?: string | null,"created_at"?: string | null,"id"?: string,"is_delete_marker"?: boolean,"is_versioned"?: boolean,"last_accessed_at"?: string | null,"metadata"?: Json | null,"name"?: string | null,"owner"?: string | null,"owner_id"?: string | null,"path_tokens"?: never,"updated_at"?: string | null,"user_metadata"?: Json | null,"version"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"bucket_id"?: string | null,"created_at"?: string | null,"id"?: string,"is_delete_marker"?: boolean,"is_versioned"?: boolean,"last_accessed_at"?: string | null,"metadata"?: Json | null,"name"?: string | null,"owner"?: string | null,"owner_id"?: string | null,"path_tokens"?: never,"updated_at"?: string | null,"user_metadata"?: Json | null,"version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "objects_bucketId_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    }
                  ]
                },"s3_multipart_uploads": {
                  Row: {
                    "bucket_id": string,"created_at": string,"id": string,"in_progress_size": number,"key": string,"metadata": Json | null,"owner_id": string | null,"upload_signature": string,"user_metadata": Json | null,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"created_at"?: string,"id": string,"in_progress_size"?: number,"key": string,"metadata"?: Json | null,"owner_id"?: string | null,"upload_signature": string,"user_metadata"?: Json | null,"version": string
                  }
                  Update: {
                    "bucket_id"?: string,"created_at"?: string,"id"?: string,"in_progress_size"?: number,"key"?: string,"metadata"?: Json | null,"owner_id"?: string | null,"upload_signature"?: string,"user_metadata"?: Json | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    }
                  ]
                },"s3_multipart_uploads_parts": {
                  Row: {
                    "bucket_id": string,"created_at": string,"etag": string,"id": string,"key": string,"owner_id": string | null,"part_number": number,"size": number,"upload_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"created_at"?: string,"etag": string,"id"?: string,"key": string,"owner_id"?: string | null,"part_number": number,"size"?: number,"upload_id": string,"version": string
                  }
                  Update: {
                    "bucket_id"?: string,"created_at"?: string,"etag"?: string,"id"?: string,"key"?: string,"owner_id"?: string | null,"part_number"?: number,"size"?: number,"upload_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
      columns: ["upload_id"]
isOneToOne: false
      referencedRelation: "s3_multipart_uploads"
      referencedColumns: ["id"]
    }
                  ]
                },"vector_indexes": {
                  Row: {
                    "bucket_id": string,"created_at": string,"data_type": string,"dimension": number,"distance_metric": string,"id": string,"metadata_configuration": Json | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"created_at"?: string,"data_type": string,"dimension": number,"distance_metric": string,"id"?: string,"metadata_configuration"?: Json | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "bucket_id"?: string,"created_at"?: string,"data_type"?: string,"dimension"?: number,"distance_metric"?: string,"id"?: string,"metadata_configuration"?: Json | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vector_indexes_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets_vectors"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "allow_any_operation":
{ Args: { "expected_operations": (string)[] }; Returns: boolean
                           },
"allow_only_operation":
{ Args: { "expected_operation": string }; Returns: boolean
                           },
"can_insert_object":
{ Args: { "bucketid": string,"metadata": Json,"name": string,"owner": string }; Returns: undefined
                           },
"delete_lifecycle_objects":
{ Args: { "object_ids": (string)[] }; Returns: {
              "id": string,"is_delete_marker": boolean,"metadata": Json
            }[]
                           },
"extension":
{ Args: { "name": string }; Returns: string
                           },
"filename":
{ Args: { "name": string }; Returns: string
                           },
"foldername":
{ Args: { "name": string }; Returns: (string)[]
                           },
"get_common_prefix":
{ Args: { "p_delimiter": string,"p_key": string,"p_prefix": string }; Returns: string
                           },
"get_size_by_bucket":
{ Args: { "delete_markers"?: string,"noncurrent_versions"?: string }; Returns: {
              "bucket_id": string,"size": number
            }[]
                           },
"list_multipart_uploads_with_delimiter":
{ Args: { "bucket_id": string,"delimiter_param": string,"max_keys"?: number,"next_key_token"?: string,"next_upload_token"?: string,"prefix_param": string,"raw_prefix_param"?: string }; Returns: {
              "created_at": string,"id": string,"key": string
            }[]
                           },
"list_objects_with_delimiter":
{ Args: { "_bucket_id": string,"delete_markers"?: string,"delimiter_param": string,"max_keys"?: number,"next_token"?: string,"next_token_archived_at"?: string,"next_token_version"?: string,"noncurrent_versions"?: string,"prefix_param": string,"sort_order"?: string,"start_after"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           },
"operation":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"reconcile_lifecycle_state":
{ Args: { "policy_changed": boolean,"target_bucket_id": string }; Returns: undefined
                           },
"search":
{ Args: { "bucketname": string,"delete_markers"?: string,"levels"?: number,"limits"?: number,"noncurrent_versions"?: string,"offsets"?: number,"prefix": string,"search"?: string,"sortcolumn"?: string,"sortorder"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           },
"search_by_timestamp":
{ Args: { "delete_markers"?: string,"noncurrent_versions"?: string,"p_bucket_id": string,"p_level": number,"p_limit": number,"p_prefix": string,"p_sort_column": string,"p_sort_column_after": string,"p_sort_order": string,"p_start_after": string,"p_start_after_version"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"key": string,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           },
"search_v2":
{ Args: { "bucket_name": string,"delete_markers"?: string,"levels"?: number,"limits"?: number,"noncurrent_versions"?: string,"prefix": string,"sort_column"?: string,"sort_column_after"?: string,"sort_order"?: string,"start_after"?: string,"start_after_archived_at"?: string,"start_after_is_continuation"?: boolean,"start_after_version"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"key": string,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           }
          }
          Enums: {
            "buckettype": "STANDARD"|"ANALYTICS"|"VECTOR"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_type_enum": ["buyer", "seller", "staff"],"application_status_enum": ["submitted", "under_review", "approved", "rejected", "withdrawn"],"auth_provider_enum": ["google", "password", "both"],"backup_job_status_enum": ["running", "completed", "failed"],"backup_job_type_enum": ["auto", "manual"],"backup_schedule_enum": ["daily", "weekly", "manual_only"],"backup_storage_provider_enum": ["r2", "s3", "admin_server"],"code_status_enum": ["issued", "delivered", "redeemed", "expired", "revoked"],"commission_scope_enum": ["global", "product_type", "category"],"compensation_status_enum": ["pending", "approved", "rejected", "fulfilled", "cancelled"],"delivery_channel_enum": ["email", "sms", "manual"],"delivery_confirmation_method_enum": ["auto", "manual"],"delivery_result_enum": ["sent", "failed", "skipped"],"download_attempt_type_enum": ["zip", "single_files"],"download_delivery_type_enum": ["single", "zip"],"download_session_status_enum": ["active", "completed", "expired", "expired_partial", "exhausted", "compensation_pending", "compensation_active", "revoked"],"download_token_scope_enum": ["single", "zip"],"drive_account_status_enum": ["active", "revoked", "quota_exceeded"],"email_outbox_status_enum": ["queued", "sending", "sent", "failed"],"exception_status_enum": ["pending", "approved", "rejected", "fulfilled"],"file_scan_status_enum": ["uploading", "uploaded", "scanning", "quarantined", "processing", "ready", "failed", "deleted", "backup_only"],"member_status_enum": ["active", "suspended", "revoked"],"order_status_enum": ["created", "paid", "fulfilled", "cancelled"],"payment_status_enum": ["pending", "succeeded", "failed", "refunded"],"payout_status_enum": ["requested", "approved", "rejected", "paid"],"preview_quality_enum": ["low", "medium", "high"],"preview_type_enum": ["image", "video", "document"],"product_status_enum": ["draft", "published", "paused", "suspended", "rejected", "deleted", "archived"],"purchase_request_status_enum": ["created", "pending", "approved", "rejected", "cancelled", "completed"],"report_status_enum": ["open", "resolved", "dismissed"],"restore_status_enum": ["running", "completed", "failed"],"review_status_enum": ["published", "deleted"],"scan_job_status_enum": ["queued", "running", "passed", "failed", "quarantined"],"security_severity_enum": ["low", "medium", "high", "critical"],"seller_status_enum": ["pending", "approved", "rejected", "suspended"],"storage_provider_enum": ["google_drive", "r2", "s3"],"ticket_status_enum": ["open", "pending", "closed"],"upload_session_status_enum": ["initiated", "uploading", "completed", "aborted", "expired", "completing"],"user_status_enum": ["active", "suspended", "deleted"],"version_status_enum": ["draft", "published", "archived"],"wallet_tx_type_enum": ["earning", "commission", "payout", "adjustment"],"watermark_direction_enum": ["diagonal", "horizontal"],"watermark_opacity_enum": ["low", "medium", "high"],"watermark_video_style_enum": ["static", "periodic", "both"]
          }
        },"storage": {
          Enums: {
            "buckettype": ["STANDARD", "ANALYTICS", "VECTOR"]
          }
        }
} as const
