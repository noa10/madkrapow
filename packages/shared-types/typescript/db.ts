export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bot_sessions: {
        Row: {
          address_json: Json | null
          cart_json: Json
          contact_json: Json | null
          created_at: string
          current_state: string
          id: string
          language: string
          last_interaction_at: string
          platform: string
          platform_user_id: string
          selected_item_id: string | null
          selected_modifier_group_index: number | null
          updated_at: string
        }
        Insert: {
          address_json?: Json | null
          cart_json?: Json
          contact_json?: Json | null
          created_at?: string
          current_state?: string
          id?: string
          language?: string
          last_interaction_at?: string
          platform: string
          platform_user_id: string
          selected_item_id?: string | null
          selected_modifier_group_index?: number | null
          updated_at?: string
        }
        Update: {
          address_json?: Json | null
          cart_json?: Json
          contact_json?: Json | null
          created_at?: string
          current_state?: string
          id?: string
          language?: string
          last_interaction_at?: string
          platform?: string
          platform_user_id?: string
          selected_item_id?: string | null
          selected_modifier_group_index?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          hubbo_pos_external_id: string | null
          hubbo_pos_last_synced_at: string | null
          hubbo_pos_source: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_source?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_source?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      channel_orders: {
        Row: {
          channel: string
          created_at: string
          external_order_id: string
          external_order_number: string | null
          external_status: string | null
          external_store_id: string | null
          id: string
          order_id: string
          raw_payload: Json | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          external_order_id: string
          external_order_number?: string | null
          external_status?: string | null
          external_store_id?: string | null
          id?: string
          order_id: string
          raw_payload?: Json | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_order_id?: string
          external_order_number?: string | null
          external_status?: string | null
          external_store_id?: string | null
          id?: string
          order_id?: string
          raw_payload?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_products: {
        Row: {
          channel: string
          created_at: string
          external_item_id: string | null
          external_name: string | null
          id: string
          is_available: boolean
          menu_item_id: string
          metadata: Json | null
          price_cents: number | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          external_item_id?: string | null
          external_name?: string | null
          id?: string
          is_available?: boolean
          menu_item_id: string
          metadata?: Json | null
          price_cents?: number | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_item_id?: string | null
          external_name?: string | null
          id?: string
          is_available?: boolean
          menu_item_id?: string
          metadata?: Json | null
          price_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_products_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          customer_id: string
          id: string
          instructions: string | null
          is_default: boolean
          label: string | null
          latitude: number | null
          longitude: number | null
          postal_code: string
          state: string
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string
          created_at?: string
          customer_id: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code: string
          state: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          customer_id?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          id: string
          name: string | null
          phone: string | null
          telegram_id: string | null
          updated_at: string
          whatsapp_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          telegram_id?: string | null
          updated_at?: string
          whatsapp_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          telegram_id?: string | null
          updated_at?: string
          whatsapp_id?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fcm_tokens: {
        Row: {
          created_at: string
          device_id: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hubbopos_api_logs: {
        Row: {
          created_at: string | null
          direction: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          id: string
          method: string
          request_body: Json | null
          request_headers: Json | null
          response_body: Json | null
          response_status: number | null
          success: boolean | null
        }
        Insert: {
          created_at?: string | null
          direction: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          id?: string
          method: string
          request_body?: Json | null
          request_headers?: Json | null
          response_body?: Json | null
          response_status?: number | null
          success?: boolean | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          id?: string
          method?: string
          request_body?: Json | null
          request_headers?: Json | null
          response_body?: Json | null
          response_status?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      hubbopos_sync_queue: {
        Row: {
          action: string
          created_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_retries: number | null
          next_attempt_at: string | null
          order_id: string | null
          payload: Json
          retry_count: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_retries?: number | null
          next_attempt_at?: string | null
          order_id?: string | null
          payload: Json
          retry_count?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_retries?: number | null
          next_attempt_at?: string | null
          order_id?: string | null
          payload?: Json
          retry_count?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubbopos_sync_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      hubbopos_sync_runs: {
        Row: {
          catalog_synced: boolean | null
          completed_at: string | null
          error_message: string | null
          id: string
          orders_pulled: number | null
          orders_pushed: number | null
          queue_failed: number | null
          queue_flushed: number | null
          reconciliation_snapshot: Json | null
          run_type: string
          started_at: string | null
          status: string
          triggered_by: string | null
        }
        Insert: {
          catalog_synced?: boolean | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          orders_pulled?: number | null
          orders_pushed?: number | null
          queue_failed?: number | null
          queue_flushed?: number | null
          reconciliation_snapshot?: Json | null
          run_type: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Update: {
          catalog_synced?: boolean | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          orders_pulled?: number | null
          orders_pushed?: number | null
          queue_failed?: number | null
          queue_flushed?: number | null
          reconciliation_snapshot?: Json | null
          run_type?: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      integration_events: {
        Row: {
          error: string | null
          event_type: string
          external_event_id: string | null
          external_order_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          event_type: string
          external_event_id?: string | null
          external_order_id?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          event_type?: string
          external_event_id?: string | null
          external_order_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      lalamove_shipments: {
        Row: {
          actual_fee_cents: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          currency: string
          dispatch_status: string
          dispatched_at: string | null
          driver_latitude: number | null
          driver_location_updated_at: string | null
          driver_longitude: number | null
          driver_name: string | null
          driver_phone: string | null
          driver_photo_url: string | null
          driver_plate: string | null
          id: string
          lalamove_order_id: string | null
          order_id: string
          quotation_id: string
          quote_expires_at: string | null
          quoted_fee_cents: number
          raw_order_response: Json | null
          raw_webhook_payload: Json | null
          recipient_json: Json
          schedule_at: string | null
          sender_json: Json
          service_type: string
          share_link: string | null
          stop_ids: Json | null
          updated_at: string
        }
        Insert: {
          actual_fee_cents?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          dispatch_status?: string
          dispatched_at?: string | null
          driver_latitude?: number | null
          driver_location_updated_at?: string | null
          driver_longitude?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_photo_url?: string | null
          driver_plate?: string | null
          id?: string
          lalamove_order_id?: string | null
          order_id: string
          quotation_id: string
          quote_expires_at?: string | null
          quoted_fee_cents: number
          raw_order_response?: Json | null
          raw_webhook_payload?: Json | null
          recipient_json: Json
          schedule_at?: string | null
          sender_json: Json
          service_type: string
          share_link?: string | null
          stop_ids?: Json | null
          updated_at?: string
        }
        Update: {
          actual_fee_cents?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          dispatch_status?: string
          dispatched_at?: string | null
          driver_latitude?: number | null
          driver_location_updated_at?: string | null
          driver_longitude?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_photo_url?: string | null
          driver_plate?: string | null
          id?: string
          lalamove_order_id?: string | null
          order_id?: string
          quotation_id?: string
          quote_expires_at?: string | null
          quoted_fee_cents?: number
          raw_order_response?: Json | null
          raw_webhook_payload?: Json | null
          recipient_json?: Json
          schedule_at?: string | null
          sender_json?: Json
          service_type?: string
          share_link?: string | null
          stop_ids?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lalamove_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lalamove_webhook_events: {
        Row: {
          created_at: string
          event_status: string | null
          event_type: string
          id: string
          lalamove_order_id: string
          processed: boolean
          processing_error: string | null
          raw_payload: Json
          signature: string | null
        }
        Insert: {
          created_at?: string
          event_status?: string | null
          event_type: string
          id?: string
          lalamove_order_id: string
          processed?: boolean
          processing_error?: string | null
          raw_payload: Json
          signature?: string | null
        }
        Update: {
          created_at?: string
          event_status?: string | null
          event_type?: string
          id?: string
          lalamove_order_id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload?: Json
          signature?: string | null
        }
        Relationships: []
      }
      legacy_import_batches: {
        Row: {
          filename: string
          id: string
          imported_at: string
          outlet_name: string | null
          record_count: number
          source_system: string
          status: string
          summary: Json | null
        }
        Insert: {
          filename: string
          id?: string
          imported_at?: string
          outlet_name?: string | null
          record_count?: number
          source_system?: string
          status?: string
          summary?: Json | null
        }
        Update: {
          filename?: string
          id?: string
          imported_at?: string
          outlet_name?: string | null
          record_count?: number
          source_system?: string
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      legacy_import_records: {
        Row: {
          batch_id: string
          created_at: string
          error_message: string | null
          id: string
          import_status: string
          legacy_invoice_no: string | null
          legacy_order_group: string | null
          legacy_system_id: string | null
          mapped_order_id: string | null
          raw: Json
          record_type: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_status: string
          legacy_invoice_no?: string | null
          legacy_order_group?: string | null
          legacy_system_id?: string | null
          mapped_order_id?: string | null
          raw: Json
          record_type?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_status?: string
          legacy_invoice_no?: string | null
          legacy_order_group?: string | null
          legacy_system_id?: string | null
          mapped_order_id?: string | null
          raw?: Json
          record_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "legacy_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_records_mapped_order_id_fkey"
            columns: ["mapped_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          menu_item_id: string
          modifier_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          menu_item_id: string
          modifier_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          menu_item_id?: string
          modifier_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          hubbo_pos_external_id: string | null
          hubbo_pos_last_synced_at: string | null
          hubbo_pos_sku: string | null
          hubbo_pos_source: string | null
          id: string
          image_url: string | null
          ingredients: string[]
          is_available: boolean
          is_signature: boolean
          name: string
          price_cents: number
          slug: string
          sort_order: number
          spice_level: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_sku?: string | null
          hubbo_pos_source?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          is_available?: boolean
          is_signature?: boolean
          name: string
          price_cents: number
          slug: string
          sort_order?: number
          spice_level?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_sku?: string | null
          hubbo_pos_source?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          is_available?: boolean
          is_signature?: boolean
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          spice_level?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          description: string | null
          hubbo_pos_external_id: string | null
          hubbo_pos_last_synced_at: string | null
          hubbo_pos_source: string | null
          id: string
          max_selections: number
          min_selections: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_source?: string | null
          id?: string
          max_selections?: number
          min_selections?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_source?: string | null
          id?: string
          max_selections?: number
          min_selections?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      modifiers: {
        Row: {
          created_at: string
          hubbo_pos_external_id: string | null
          hubbo_pos_last_synced_at: string | null
          hubbo_pos_source: string | null
          id: string
          is_available: boolean
          is_default: boolean
          modifier_group_id: string
          name: string
          price_delta_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_source?: string | null
          id?: string
          is_available?: boolean
          is_default?: boolean
          modifier_group_id: string
          name: string
          price_delta_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hubbo_pos_external_id?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_source?: string | null
          id?: string
          is_available?: boolean
          is_default?: boolean
          modifier_group_id?: string
          name?: string
          price_delta_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_display_codes: {
        Row: {
          code: string
          code_date: string
          created_at: string
        }
        Insert: {
          code: string
          code_date: string
          created_at?: string
        }
        Update: {
          code?: string
          code_date?: string
          created_at?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          created_at: string
          id: string
          modifier_id: string
          modifier_name: string
          modifier_price_delta_cents: number
          order_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modifier_id: string
          modifier_name: string
          modifier_price_delta_cents?: number
          order_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modifier_id?: string
          modifier_name?: string
          modifier_price_delta_cents?: number
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          line_total_cents: number
          menu_item_id: string
          menu_item_name: string
          menu_item_price_cents: number
          notes: string | null
          order_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          line_total_cents: number
          menu_item_id: string
          menu_item_name: string
          menu_item_price_cents: number
          notes?: string | null
          order_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          line_total_cents?: number
          menu_item_id?: string
          menu_item_name?: string
          menu_item_price_cents?: number
          notes?: string | null
          order_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_promo_applications: {
        Row: {
          created_at: string
          discount_cents: number
          id: string
          order_id: string
          promo_id: string
          scope: string
        }
        Insert: {
          created_at?: string
          discount_cents?: number
          id?: string
          order_id: string
          promo_id: string
          scope: string
        }
        Update: {
          created_at?: string
          discount_cents?: number
          id?: string
          order_id?: string
          promo_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_promo_applications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_promo_applications_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approval_status: string | null
          approved_total_cents: number | null
          bot_session_id: string | null
          bulk_budget_cents: number | null
          bulk_company_name: string | null
          bulk_contact_phone: string | null
          bulk_dropoff_instructions: string | null
          bulk_headcount: number | null
          bulk_invoice_name: string | null
          bulk_requested_date: string | null
          bulk_special_notes: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address_id: string | null
          delivery_address_json: Json | null
          delivery_fee_cents: number
          delivery_type: string
          discount_cents: number
          dispatch_after: string | null
          dispatch_status: string | null
          display_code: string
          driver_latitude: number | null
          driver_location_updated_at: string | null
          driver_longitude: number | null
          driver_name: string | null
          driver_phone: string | null
          driver_plate_number: string | null
          fulfillment_type: string
          hubbo_pos_invoice_no: string | null
          hubbo_pos_last_error: string | null
          hubbo_pos_last_synced_at: string | null
          hubbo_pos_order_id: string | null
          hubbo_pos_payment_status: string | null
          hubbo_pos_sync_status: string | null
          hubbo_pos_trans_id: string | null
          id: string
          include_cutlery: boolean
          kitchen_lead_minutes: number | null
          lalamove_order_id: string | null
          lalamove_quote_id: string | null
          lalamove_status: string | null
          notes: string | null
          order_kind: string
          order_number: string
          promo_code_id: string | null
          requested_window_end: string | null
          requested_window_start: string | null
          requires_manual_review: boolean | null
          rescheduled_from: string | null
          review_notes: string | null
          scheduled_for: string | null
          scheduled_notes: string | null
          source: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          approval_status?: string | null
          approved_total_cents?: number | null
          bot_session_id?: string | null
          bulk_budget_cents?: number | null
          bulk_company_name?: string | null
          bulk_contact_phone?: string | null
          bulk_dropoff_instructions?: string | null
          bulk_headcount?: number | null
          bulk_invoice_name?: string | null
          bulk_requested_date?: string | null
          bulk_special_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address_id?: string | null
          delivery_address_json?: Json | null
          delivery_fee_cents?: number
          delivery_type?: string
          discount_cents?: number
          dispatch_after?: string | null
          dispatch_status?: string | null
          display_code: string
          driver_latitude?: number | null
          driver_location_updated_at?: string | null
          driver_longitude?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_plate_number?: string | null
          fulfillment_type?: string
          hubbo_pos_invoice_no?: string | null
          hubbo_pos_last_error?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_order_id?: string | null
          hubbo_pos_payment_status?: string | null
          hubbo_pos_sync_status?: string | null
          hubbo_pos_trans_id?: string | null
          id?: string
          include_cutlery?: boolean
          kitchen_lead_minutes?: number | null
          lalamove_order_id?: string | null
          lalamove_quote_id?: string | null
          lalamove_status?: string | null
          notes?: string | null
          order_kind?: string
          order_number: string
          promo_code_id?: string | null
          requested_window_end?: string | null
          requested_window_start?: string | null
          requires_manual_review?: boolean | null
          rescheduled_from?: string | null
          review_notes?: string | null
          scheduled_for?: string | null
          scheduled_notes?: string | null
          source?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents: number
          total_cents: number
          updated_at?: string
        }
        Update: {
          approval_status?: string | null
          approved_total_cents?: number | null
          bot_session_id?: string | null
          bulk_budget_cents?: number | null
          bulk_company_name?: string | null
          bulk_contact_phone?: string | null
          bulk_dropoff_instructions?: string | null
          bulk_headcount?: number | null
          bulk_invoice_name?: string | null
          bulk_requested_date?: string | null
          bulk_special_notes?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address_id?: string | null
          delivery_address_json?: Json | null
          delivery_fee_cents?: number
          delivery_type?: string
          discount_cents?: number
          dispatch_after?: string | null
          dispatch_status?: string | null
          display_code?: string
          driver_latitude?: number | null
          driver_location_updated_at?: string | null
          driver_longitude?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_plate_number?: string | null
          fulfillment_type?: string
          hubbo_pos_invoice_no?: string | null
          hubbo_pos_last_error?: string | null
          hubbo_pos_last_synced_at?: string | null
          hubbo_pos_order_id?: string | null
          hubbo_pos_payment_status?: string | null
          hubbo_pos_sync_status?: string | null
          hubbo_pos_trans_id?: string | null
          id?: string
          include_cutlery?: boolean
          kitchen_lead_minutes?: number | null
          lalamove_order_id?: string | null
          lalamove_quote_id?: string | null
          lalamove_status?: string | null
          notes?: string | null
          order_kind?: string
          order_number?: string
          promo_code_id?: string | null
          requested_window_end?: string | null
          requested_window_start?: string | null
          requires_manual_review?: boolean | null
          rescheduled_from?: string | null
          review_notes?: string | null
          scheduled_for?: string | null
          scheduled_notes?: string | null
          source?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_orders_bot_session"
            columns: ["bot_session_id"]
            isOneToOne: false
            referencedRelation: "bot_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          method: string
          order_id: string
          paid_at: string | null
          raw: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          method: string
          order_id: string
          paid_at?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          method?: string
          order_id?: string
          paid_at?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          application_type: string
          campaign_id: string | null
          code: string
          created_at: string
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_discount_cents: number | null
          max_uses: number | null
          min_order_amount_cents: number | null
          rules: Json | null
          scope: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          application_type?: string
          campaign_id?: string | null
          code: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_discount_cents?: number | null
          max_uses?: number | null
          min_order_amount_cents?: number | null
          rules?: Json | null
          scope?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          application_type?: string
          campaign_id?: string | null
          code?: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount_cents?: number | null
          max_uses?: number | null
          min_order_amount_cents?: number | null
          rules?: Json | null
          scope?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          promo_id: string
          quantity: number
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          promo_id: string
          quantity?: number
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          promo_id?: string
          quantity?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_items_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_cents: number
          created_at: string
          external_ref: string | null
          id: string
          order_id: string
          payment_id: string | null
          raw: Json | null
          reason: string | null
          refunded_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          external_ref?: string | null
          id?: string
          order_id: string
          payment_id?: string | null
          raw?: Json | null
          reason?: string | null
          refunded_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          external_ref?: string | null
          id?: string
          order_id?: string
          payment_id?: string | null
          raw?: Json | null
          reason?: string | null
          refunded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      store_branding: {
        Row: {
          created_at: string
          hero_image_url: string | null
          id: string
          logo_url: string | null
          store_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hero_image_url?: string | null
          id?: string
          logo_url?: string | null
          store_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hero_image_url?: string | null
          id?: string
          logo_url?: string | null
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          address: string | null
          bulk_delivery_fee_cents: number | null
          bulk_enabled: boolean | null
          bulk_extra_prep_minutes: number | null
          bulk_max_items_per_slot: number | null
          bulk_min_notice_hours: number | null
          bulk_packaging_fee_cents: number | null
          bulk_threshold_cents: number | null
          created_at: string
          cutlery_default: boolean
          cutlery_enabled: boolean
          delivery_fee: number | null
          delivery_geofence_json: Json | null
          hero_image_url: string | null
          hubbo_pos_circuit_state: string | null
          hubbo_pos_enabled: boolean | null
          hubbo_pos_health_status: string | null
          hubbo_pos_last_catalog_sync_at: string | null
          hubbo_pos_last_error: string | null
          hubbo_pos_last_error_at: string | null
          hubbo_pos_last_order_sync_at: string | null
          hubbo_pos_last_sync_at: string | null
          hubbo_pos_location_id: string | null
          hubbo_pos_merchant_id: string | null
          hubbo_pos_read_only_mode: boolean | null
          hubbo_pos_sync_interval_minutes: number | null
          id: string
          kitchen_lead_minutes: number | null
          lalamove_market: string | null
          logo_url: string | null
          min_order_amount: number | null
          operating_hours: Json | null
          phone: string | null
          pickup_enabled: boolean | null
          store_name: string
          telegram_bot_enabled: boolean
          telegram_kitchen_group_chat_id: string | null
          updated_at: string
          whatsapp_bot_enabled: boolean
        }
        Insert: {
          address?: string | null
          bulk_delivery_fee_cents?: number | null
          bulk_enabled?: boolean | null
          bulk_extra_prep_minutes?: number | null
          bulk_max_items_per_slot?: number | null
          bulk_min_notice_hours?: number | null
          bulk_packaging_fee_cents?: number | null
          bulk_threshold_cents?: number | null
          created_at?: string
          cutlery_default?: boolean
          cutlery_enabled?: boolean
          delivery_fee?: number | null
          delivery_geofence_json?: Json | null
          hero_image_url?: string | null
          hubbo_pos_circuit_state?: string | null
          hubbo_pos_enabled?: boolean | null
          hubbo_pos_health_status?: string | null
          hubbo_pos_last_catalog_sync_at?: string | null
          hubbo_pos_last_error?: string | null
          hubbo_pos_last_error_at?: string | null
          hubbo_pos_last_order_sync_at?: string | null
          hubbo_pos_last_sync_at?: string | null
          hubbo_pos_location_id?: string | null
          hubbo_pos_merchant_id?: string | null
          hubbo_pos_read_only_mode?: boolean | null
          hubbo_pos_sync_interval_minutes?: number | null
          id?: string
          kitchen_lead_minutes?: number | null
          lalamove_market?: string | null
          logo_url?: string | null
          min_order_amount?: number | null
          operating_hours?: Json | null
          phone?: string | null
          pickup_enabled?: boolean | null
          store_name?: string
          telegram_bot_enabled?: boolean
          telegram_kitchen_group_chat_id?: string | null
          updated_at?: string
          whatsapp_bot_enabled?: boolean
        }
        Update: {
          address?: string | null
          bulk_delivery_fee_cents?: number | null
          bulk_enabled?: boolean | null
          bulk_extra_prep_minutes?: number | null
          bulk_max_items_per_slot?: number | null
          bulk_min_notice_hours?: number | null
          bulk_packaging_fee_cents?: number | null
          bulk_threshold_cents?: number | null
          created_at?: string
          cutlery_default?: boolean
          cutlery_enabled?: boolean
          delivery_fee?: number | null
          delivery_geofence_json?: Json | null
          hero_image_url?: string | null
          hubbo_pos_circuit_state?: string | null
          hubbo_pos_enabled?: boolean | null
          hubbo_pos_health_status?: string | null
          hubbo_pos_last_catalog_sync_at?: string | null
          hubbo_pos_last_error?: string | null
          hubbo_pos_last_error_at?: string | null
          hubbo_pos_last_order_sync_at?: string | null
          hubbo_pos_last_sync_at?: string | null
          hubbo_pos_location_id?: string | null
          hubbo_pos_merchant_id?: string | null
          hubbo_pos_read_only_mode?: boolean | null
          hubbo_pos_sync_interval_minutes?: number | null
          id?: string
          kitchen_lead_minutes?: number | null
          lalamove_market?: string | null
          logo_url?: string | null
          min_order_amount?: number | null
          operating_hours?: Json | null
          phone?: string | null
          pickup_enabled?: boolean | null
          store_name?: string
          telegram_bot_enabled?: boolean
          telegram_kitchen_group_chat_id?: string | null
          updated_at?: string
          whatsapp_bot_enabled?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      daily_channel_summary: {
        Row: {
          channel: string | null
          discounts_cents: number | null
          order_count: number | null
          order_date: string | null
          revenue_cents: number | null
        }
        Relationships: []
      }
      daily_order_summary: {
        Row: {
          avg_order_cents: number | null
          delivery_count: number | null
          delivery_fees_cents: number | null
          discounts_cents: number | null
          order_count: number | null
          order_date: string | null
          pickup_count: number | null
          revenue_cents: number | null
          subtotal_cents: number | null
        }
        Relationships: []
      }
      top_selling_items: {
        Row: {
          menu_item_id: string | null
          menu_item_name: string | null
          total_quantity: number | null
          total_revenue_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_order_display_codes: {
        Args: { retention_days?: number }
        Returns: number
      }
      increment_promo_code_usage: {
        Args: { p_increment?: number; p_promo_id: string }
        Returns: boolean
      }
      is_admin_or_manager: { Args: never; Returns: boolean }
      kl_today: { Args: never; Returns: string }
      legacy_fnv1a_display_code: {
        Args: { code_date: string; order_id: string }
        Returns: string
      }
      menu_items_slugify: { Args: { input: string }; Returns: string }
      reserve_order_display_code: {
        Args: { target_date: string }
        Returns: string
      }
      set_default_address: {
        Args: { p_address_id: string; p_customer_id: string }
        Returns: undefined
      }
      set_default_contact: {
        Args: { p_contact_id: string; p_customer_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

