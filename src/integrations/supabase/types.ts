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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sku_prefix: string
          sku_seq: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sku_prefix: string
          sku_seq?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sku_prefix?: string
          sku_seq?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          barcode: string | null
          category_id: string | null
          coding: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          initial_quantity: number | null
          is_active: boolean
          name: string
          ref_number: string | null
          remarks: string | null
          reorder_level: number
          sku: string
          source: string | null
          unit_price: number
          uom: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          coding?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          initial_quantity?: number | null
          is_active?: boolean
          name: string
          ref_number?: string | null
          remarks?: string | null
          reorder_level?: number
          sku: string
          source?: string | null
          unit_price?: number
          uom?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          coding?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          initial_quantity?: number | null
          is_active?: boolean
          name?: string
          ref_number?: string | null
          remarks?: string | null
          reorder_level?: number
          sku?: string
          source?: string | null
          unit_price?: number
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          prefs: Json
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          prefs?: Json
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          prefs?: Json
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_materials: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          item_id: string | null
          notes: string | null
          project_id: string
          quantity: number
          unit: string | null
          unit_cost: number
          updated_at: string
          used_on: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          project_id: string
          quantity?: number
          unit?: string | null
          unit_cost?: number
          updated_at?: string
          used_on?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          project_id?: string
          quantity?: number
          unit?: string | null
          unit_cost?: number
          updated_at?: string
          used_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          batch_ref: string | null
          condition: Database["public"]["Enums"]["return_condition"]
          created_at: string
          created_by: string
          id: string
          item_id: string
          movement_id: string | null
          notes: string | null
          project_id: string | null
          quantity: number
          return_date: string
          returned_by_name: string | null
          returned_by_user_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
          warehouse_id: string
          withdrawal_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          batch_ref?: string | null
          condition?: Database["public"]["Enums"]["return_condition"]
          created_at?: string
          created_by: string
          id?: string
          item_id: string
          movement_id?: string | null
          notes?: string | null
          project_id?: string | null
          quantity: number
          return_date?: string
          returned_by_name?: string | null
          returned_by_user_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
          warehouse_id: string
          withdrawal_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          batch_ref?: string | null
          condition?: Database["public"]["Enums"]["return_condition"]
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          movement_id?: string | null
          notes?: string | null
          project_id?: string | null
          quantity?: number
          return_date?: string
          returned_by_name?: string | null
          returned_by_user_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
          warehouse_id?: string
          withdrawal_id?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          line_total: number
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          line_total?: number
          quantity: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          line_total?: number
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string | null
          discount: number
          id: string
          invoice_no: string
          notes: string | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_id?: string | null
          discount?: number
          id?: string
          invoice_no: string
          notes?: string | null
          sale_date?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          discount?: number
          id?: string
          invoice_no?: string
          notes?: string | null
          sale_date?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          id: string
          item_id: string
          quantity: number
          status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          item_id: string
          quantity?: number
          status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          item_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_ref: string | null
          created_at: string
          created_by: string | null
          from_warehouse_id: string | null
          id: string
          item_id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          quantity: number
          reason: string | null
          reference: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["movement_status"]
          to_warehouse_id: string | null
        }
        Insert: {
          batch_ref?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string | null
          id?: string
          item_id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          quantity: number
          reason?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          to_warehouse_id?: string | null
        }
        Update: {
          batch_ref?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string | null
          id?: string
          item_id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          quantity?: number
          reason?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          to_warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          batch_ref: string | null
          created_at: string
          id: string
          item_id: string
          project_id: string | null
          quantity: number
          reason: string | null
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          batch_ref?: string | null
          created_at?: string
          id?: string
          item_id: string
          project_id?: string | null
          quantity: number
          reason?: string | null
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          batch_ref?: string | null
          created_at?: string
          id?: string
          item_id?: string
          project_id?: string | null
          quantity?: number
          reason?: string | null
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_chats: {
        Row: {
          chat_id: number
          created_at: string
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          chat_id: number
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          id: string
          message_id: number | null
          raw: Json | null
          sender_name: string | null
          sender_user_id: string | null
          telegram_file_id: string | null
          text: string | null
          update_id: number | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          chat_id: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction: string
          id?: string
          message_id?: number | null
          raw?: Json | null
          sender_name?: string | null
          sender_user_id?: string | null
          telegram_file_id?: string | null
          text?: string | null
          update_id?: number | null
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          chat_id?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: string
          message_id?: number | null
          raw?: Json | null
          sender_name?: string | null
          sender_user_id?: string | null
          telegram_file_id?: string | null
          text?: string | null
          update_id?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          batch_ref: string | null
          created_at: string
          expected_return_date: string | null
          id: string
          item_id: string
          movement_id: string | null
          notes: string | null
          project_id: string | null
          project_reference: string | null
          purpose: string
          quantity: number
          requested_by: string
          return_expected: boolean
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
          warehouse_id: string
          withdrawal_date: string
          withdrawn_by_name: string | null
          withdrawn_by_user_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          batch_ref?: string | null
          created_at?: string
          expected_return_date?: string | null
          id?: string
          item_id: string
          movement_id?: string | null
          notes?: string | null
          project_id?: string | null
          project_reference?: string | null
          purpose: string
          quantity: number
          requested_by: string
          return_expected?: boolean
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          warehouse_id: string
          withdrawal_date?: string
          withdrawn_by_name?: string | null
          withdrawn_by_user_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          batch_ref?: string | null
          created_at?: string
          expected_return_date?: string | null
          id?: string
          item_id?: string
          movement_id?: string | null
          notes?: string | null
          project_id?: string | null
          project_reference?: string | null
          purpose?: string
          quantity?: number
          requested_by?: string
          return_expected?: boolean
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          warehouse_id?: string
          withdrawal_date?: string
          withdrawn_by_name?: string | null
          withdrawn_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "viewer"
      movement_status: "pending" | "approved" | "rejected"
      movement_type: "in" | "out" | "transfer" | "adjustment"
      request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "on_arrival"
        | "arrived"
        | "received"
      return_condition: "good" | "damaged" | "lost" | "partial"
      return_status: "pending" | "completed" | "cancelled"
      sale_status: "draft" | "confirmed" | "paid" | "cancelled"
      stock_status:
        | "available"
        | "reserved"
        | "on_arrival"
        | "arrived"
        | "damaged"
        | "partial"
      withdrawal_status: "pending" | "approved" | "rejected" | "cancelled"
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
      app_role: ["admin", "manager", "staff", "viewer"],
      movement_status: ["pending", "approved", "rejected"],
      movement_type: ["in", "out", "transfer", "adjustment"],
      request_status: [
        "pending",
        "approved",
        "rejected",
        "on_arrival",
        "arrived",
        "received",
      ],
      return_condition: ["good", "damaged", "lost", "partial"],
      return_status: ["pending", "completed", "cancelled"],
      sale_status: ["draft", "confirmed", "paid", "cancelled"],
      stock_status: [
        "available",
        "reserved",
        "on_arrival",
        "arrived",
        "damaged",
        "partial",
      ],
      withdrawal_status: ["pending", "approved", "rejected", "cancelled"],
    },
  },
} as const
