// Generated from the Fight Camp Supabase schema (project edxadcgotbdipyndtoph).
// Regenerate after schema changes with:
//   npx supabase gen types typescript --project-id=edxadcgotbdipyndtoph --schema=public > src/lib/database.types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      camps: {
        Row: {
          camp_weeks: number
          completed_sessions: Json | null
          created_at: string
          current_weight: number
          day_overrides: Json | null
          deleted_at: string | null
          experience: string
          fight_date: string | null
          game_plan: Json | null
          id: string
          is_off_season: boolean | null
          off_season_goal: string | null
          opponent: string | null
          round_duration: number
          rounds: number
          sport: string
          start_date: string
          target_weight: number
          training_schedule: Json | null
          updated_at: string
          user_id: string
          weight_class: string
        }
        Insert: {
          camp_weeks: number
          completed_sessions?: Json | null
          created_at?: string
          current_weight: number
          day_overrides?: Json | null
          deleted_at?: string | null
          experience: string
          fight_date?: string | null
          game_plan?: Json | null
          id?: string
          is_off_season?: boolean | null
          off_season_goal?: string | null
          opponent?: string | null
          round_duration: number
          rounds: number
          sport: string
          start_date: string
          target_weight: number
          training_schedule?: Json | null
          updated_at?: string
          user_id: string
          weight_class: string
        }
        Update: {
          camp_weeks?: number
          completed_sessions?: Json | null
          created_at?: string
          current_weight?: number
          day_overrides?: Json | null
          deleted_at?: string | null
          experience?: string
          fight_date?: string | null
          game_plan?: Json | null
          id?: string
          is_off_season?: boolean | null
          off_season_goal?: string | null
          opponent?: string | null
          round_duration?: number
          rounds?: number
          sport?: string
          start_date?: string
          target_weight?: number
          training_schedule?: Json | null
          updated_at?: string
          user_id?: string
          weight_class?: string
        }
        Relationships: []
      }
      coach_fighter_links: {
        Row: {
          coach_id: string
          created_at: string
          fighter_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          fighter_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          fighter_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_fighter_links_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_fighter_links_fighter_id_fkey"
            columns: ["fighter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_invites: {
        Row: {
          coach_id: string
          code: string
          created_at: string
          expires_at: string
        }
        Insert: {
          coach_id: string
          code: string
          created_at?: string
          expires_at?: string
        }
        Update: {
          coach_id?: string
          code?: string
          created_at?: string
          expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          camp_id: string
          category: string
          coach_id: string
          coach_name: string
          content: string
          created_at: string
          deleted_at: string | null
          fighter_id: string
          id: string
          updated_at: string
        }
        Insert: {
          camp_id: string
          category: string
          coach_id: string
          coach_name: string
          content: string
          created_at?: string
          deleted_at?: string | null
          fighter_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          camp_id?: string
          category?: string
          coach_id?: string
          coach_name?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          fighter_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_fighter_id_fkey"
            columns: ["fighter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conditioning_tests: {
        Row: {
          camp_id: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string | null
          test_type: string
          unit: string
          updated_at: string
          user_id: string
          value: number
          week_number: number
        }
        Insert: {
          camp_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          test_type: string
          unit: string
          updated_at?: string
          user_id: string
          value: number
          week_number: number
        }
        Update: {
          camp_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          test_type?: string
          unit?: string
          updated_at?: string
          user_id?: string
          value?: number
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "conditioning_tests_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
      fight_results: {
        Row: {
          camp_id: string
          created_at: string
          deleted_at: string | null
          fight_date: string
          fight_night_weight: number | null
          id: string
          lessons: string | null
          method: string
          opponent: string
          outcome: string
          overall_notes: string | null
          readiness_at_fight: number | null
          round_stopped: number | null
          rounds: Json
          style_plan_followed: number | null
          total_rounds: number
          updated_at: string
          user_id: string
          weigh_in_weight: number | null
        }
        Insert: {
          camp_id: string
          created_at?: string
          deleted_at?: string | null
          fight_date: string
          fight_night_weight?: number | null
          id?: string
          lessons?: string | null
          method: string
          opponent: string
          outcome: string
          overall_notes?: string | null
          readiness_at_fight?: number | null
          round_stopped?: number | null
          rounds?: Json
          style_plan_followed?: number | null
          total_rounds: number
          updated_at?: string
          user_id: string
          weigh_in_weight?: number | null
        }
        Update: {
          camp_id?: string
          created_at?: string
          deleted_at?: string | null
          fight_date?: string
          fight_night_weight?: number | null
          id?: string
          lessons?: string | null
          method?: string
          opponent?: string
          outcome?: string
          overall_notes?: string | null
          readiness_at_fight?: number | null
          round_stopped?: number | null
          rounds?: Json
          style_plan_followed?: number | null
          total_rounds?: number
          updated_at?: string
          user_id?: string
          weigh_in_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fight_results_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
      hrv_entries: {
        Row: {
          camp_id: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string | null
          resting_hr: number | null
          rmssd: number
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          camp_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          resting_hr?: number | null
          rmssd: number
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          camp_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          resting_hr?: number | null
          rmssd?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hrv_entries_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          camp_id: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          macros: Json | null
          meal_ratings: Json | null
          notes: string | null
          updated_at: string
          user_id: string
          water_oz: number | null
        }
        Insert: {
          camp_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          macros?: Json | null
          meal_ratings?: Json | null
          notes?: string | null
          updated_at?: string
          user_id: string
          water_oz?: number | null
        }
        Update: {
          camp_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          macros?: Json | null
          meal_ratings?: Json | null
          notes?: string | null
          updated_at?: string
          user_id?: string
          water_oz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number
          avatar_url: string | null
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          experience: string
          factor_weights: Json | null
          gym: string | null
          id: string
          macro_targets: Json | null
          max_hr: number | null
          mep_target: number | null
          name: string
          record: string | null
          role: string
          sport: string
          updated_at: string
          weight_class: string
        }
        Insert: {
          age: number
          avatar_url?: string | null
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          experience: string
          factor_weights?: Json | null
          gym?: string | null
          id: string
          macro_targets?: Json | null
          max_hr?: number | null
          mep_target?: number | null
          name: string
          record?: string | null
          role: string
          sport: string
          updated_at?: string
          weight_class: string
        }
        Update: {
          age?: number
          avatar_url?: string | null
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          experience?: string
          factor_weights?: Json | null
          gym?: string | null
          id?: string
          macro_targets?: Json | null
          max_hr?: number | null
          mep_target?: number | null
          name?: string
          record?: string | null
          role?: string
          sport?: string
          updated_at?: string
          weight_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sparring_logs: {
        Row: {
          camp_id: string
          created_at: string
          date: string
          deleted_at: string | null
          focus: string
          id: string
          notes: string | null
          partner_level: string
          partner_name: string
          performance: number
          round_duration: number
          rounds: number
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          camp_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          focus: string
          id?: string
          notes?: string | null
          partner_level: string
          partner_name: string
          performance: number
          round_duration: number
          rounds: number
          updated_at?: string
          user_id: string
          week_number: number
        }
        Update: {
          camp_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          focus?: string
          id?: string
          notes?: string | null
          partner_level?: string
          partner_name?: string
          performance?: number
          round_duration?: number
          rounds?: number
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sparring_logs_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_presets: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          rest_sec: number
          rounds: number
          updated_at: string
          user_id: string
          work_sec: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          rest_sec: number
          rounds: number
          updated_at?: string
          user_id: string
          work_sec: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          rest_sec?: number
          rounds?: number
          updated_at?: string
          user_id?: string
          work_sec?: number
        }
        Relationships: []
      }
      user_state: {
        Row: {
          dashboard_prefs: Json | null
          fitbit_config: Json | null
          gamification: Json | null
          subscription: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dashboard_prefs?: Json | null
          fitbit_config?: Json | null
          gamification?: Json | null
          subscription?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dashboard_prefs?: Json | null
          fitbit_config?: Json | null
          gamification?: Json | null
          subscription?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_entries: {
        Row: {
          camp_id: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          camp_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          weight: number
        }
        Update: {
          camp_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_entries_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          camp_id: string
          completed: boolean
          created_at: string
          date: string
          day_label: string
          deleted_at: string | null
          duration: number
          id: string
          mep: number | null
          notes: string | null
          rpe: number
          session_type: string
          title: string
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          camp_id: string
          completed?: boolean
          created_at?: string
          date: string
          day_label: string
          deleted_at?: string | null
          duration: number
          id?: string
          mep?: number | null
          notes?: string | null
          rpe: number
          session_type: string
          title: string
          updated_at?: string
          user_id: string
          week_number: number
        }
        Update: {
          camp_id?: string
          completed?: boolean
          created_at?: string
          date?: string
          day_label?: string
          deleted_at?: string | null
          duration?: number
          id?: string
          mep?: number | null
          notes?: string | null
          rpe?: number
          session_type?: string
          title?: string
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_coach_of: { Args: { fighter: string }; Returns: boolean }
      redeem_coach_invite: { Args: { invite_code: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
