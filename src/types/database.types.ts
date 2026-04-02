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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      customers: {
        Row: {
          auth_user_id: string
          created_at: string
          id: string
          name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
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
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price_cents: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
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
      order_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          order_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id: string
        }
        Update: {
          created_at?: string | null
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
      orders: {
        Row: {
          approval_status: string | null
          approved_total_cents: number | null
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
          driver_name: string | null
          driver_phone: string | null
          driver_plate_number: string | null
          fulfillment_type: string
          id: string
          kitchen_lead_minutes: number | null
          lalamove_order_id: string | null
          lalamove_quote_id: string | null
          lalamove_status: string | null
          notes: string | null
          order_kind: string
          order_number: string
          requested_window_end: string | null
          requested_window_start: string | null
          requires_manual_review: boolean | null
          rescheduled_from: string | null
          review_notes: string | null
          scheduled_for: string | null
          scheduled_notes: string | null
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
          driver_name?: string | null
          driver_phone?: string | null
          driver_plate_number?: string | null
          fulfillment_type?: string
          id?: string
          kitchen_lead_minutes?: number | null
          lalamove_order_id?: string | null
          lalamove_quote_id?: string | null
          lalamove_status?: string | null
          notes?: string | null
          order_kind?: string
          order_number: string
          requested_window_end?: string | null
          requested_window_start?: string | null
          requires_manual_review?: boolean | null
          rescheduled_from?: string | null
          review_notes?: string | null
          scheduled_for?: string | null
          scheduled_notes?: string | null
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
          driver_name?: string | null
          driver_phone?: string | null
          driver_plate_number?: string | null
          fulfillment_type?: string
          id?: string
          kitchen_lead_minutes?: number | null
          lalamove_order_id?: string | null
          lalamove_quote_id?: string | null
          lalamove_status?: string | null
          notes?: string | null
          order_kind?: string
          order_number?: string
          requested_window_end?: string | null
          requested_window_start?: string | null
          requires_manual_review?: boolean | null
          rescheduled_from?: string | null
          review_notes?: string | null
          scheduled_for?: string | null
          scheduled_notes?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "orders_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount_cents: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount_cents?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount_cents?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
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
          delivery_fee: number | null
          id: string
          kitchen_lead_minutes: number | null
          lalamove_market: string | null
          min_order_amount: number | null
          operating_hours: Json | null
          phone: string | null
          pickup_enabled: boolean | null
          store_name: string
          updated_at: string
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
          delivery_fee?: number | null
          id?: string
          kitchen_lead_minutes?: number | null
          lalamove_market?: string | null
          min_order_amount?: number | null
          operating_hours?: Json | null
          phone?: string | null
          pickup_enabled?: boolean | null
          store_name?: string
          updated_at?: string
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
          delivery_fee?: number | null
          id?: string
          kitchen_lead_minutes?: number | null
          lalamove_market?: string | null
          min_order_amount?: number | null
          operating_hours?: Json | null
          phone?: string | null
          pickup_enabled?: boolean | null
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
