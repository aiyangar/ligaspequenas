import { createClient } from '@supabase/supabase-js'

// Configuración de Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase. Verifica tu archivo .env.local')
}

// Crear cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Tipos de la base de datos
export interface Database {
  public: {
    Tables: {
      categorias: {
        Row: {
          id: number
          nombre: string
          edad_minima: number
          edad_maxima: number
          descripcion: string | null
          activa: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          nombre: string
          edad_minima: number
          edad_maxima: number
          descripcion?: string | null
          activa?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          nombre?: string
          edad_minima?: number
          edad_maxima?: number
          descripcion?: string | null
          activa?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      posiciones: {
        Row: {
          id: number
          nombre: string
          codigo: string
          descripcion: string | null
          es_obligatoria: boolean
          orden_campo: number | null
          activa: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          nombre: string
          codigo: string
          descripcion?: string | null
          es_obligatoria?: boolean
          orden_campo?: number | null
          activa?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          nombre?: string
          codigo?: string
          descripcion?: string | null
          es_obligatoria?: boolean
          orden_campo?: number | null
          activa?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      equipos_internos: {
        Row: {
          id: number
          nombre: string
          categoria_id: number
          color_uniforme: string | null
          entrenador_principal: string | null
          entrenador_asistente: string | null
          telefono_contacto: string | null
          email_contacto: string | null
          activo: boolean
          fecha_creacion: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          nombre: string
          categoria_id: number
          color_uniforme?: string | null
          entrenador_principal?: string | null
          entrenador_asistente?: string | null
          telefono_contacto?: string | null
          email_contacto?: string | null
          activo?: boolean
          fecha_creacion?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          nombre?: string
          categoria_id?: number
          color_uniforme?: string | null
          entrenador_principal?: string | null
          entrenador_asistente?: string | null
          telefono_contacto?: string | null
          email_contacto?: string | null
          activo?: boolean
          fecha_creacion?: string
          created_at?: string
          updated_at?: string
        }
      }
      jugadores: {
        Row: {
          id: number
          nombre: string
          apellido_paterno: string
          apellido_materno: string | null
          fecha_nacimiento: string
          edad: number
          numero_playera: number
          equipo_interno_id: number
          categoria_id: number
          nombre_padre_tutor: string | null
          nombre_madre_tutora: string | null
          telefono_emergencia: string | null
          alergias: string | null
          medicamentos: string | null
          condiciones_medicas: string | null
          fotografia_url: string | null
          activo: boolean
          fecha_registro: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          nombre: string
          apellido_paterno: string
          apellido_materno?: string | null
          fecha_nacimiento: string
          numero_playera: number
          equipo_interno_id: number
          categoria_id: number
          nombre_padre_tutor?: string | null
          nombre_madre_tutora?: string | null
          telefono_emergencia?: string | null
          alergias?: string | null
          medicamentos?: string | null
          condiciones_medicas?: string | null
          fotografia_url?: string | null
          activo?: boolean
          fecha_registro?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          nombre?: string
          apellido_paterno?: string
          apellido_materno?: string | null
          fecha_nacimiento?: string
          numero_playera?: number
          equipo_interno_id?: number
          categoria_id?: number
          nombre_padre_tutor?: string | null
          nombre_madre_tutora?: string | null
          telefono_emergencia?: string | null
          alergias?: string | null
          medicamentos?: string | null
          condiciones_medicas?: string | null
          fotografia_url?: string | null
          activo?: boolean
          fecha_registro?: string
          created_at?: string
          updated_at?: string
        }
      }
      roles_usuario: {
        Row: {
          id: number
          nombre: string
          descripcion: string | null
          nivel_permisos: number
          permisos: any
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          nombre: string
          descripcion?: string | null
          nivel_permisos: number
          permisos: any
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          nombre?: string
          descripcion?: string | null
          nivel_permisos?: number
          permisos?: any
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      usuarios: {
        Row: {
          id: string
          email: string
          password_hash: string
          nombre: string
          apellido_paterno: string
          apellido_materno: string | null
          telefono: string | null
          activo: boolean
          email_verificado: boolean
          ultimo_acceso: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          password_hash: string
          nombre: string
          apellido_paterno: string
          apellido_materno?: string | null
          telefono?: string | null
          activo?: boolean
          email_verificado?: boolean
          ultimo_acceso?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          password_hash?: string
          nombre?: string
          apellido_paterno?: string
          apellido_materno?: string | null
          telefono?: string | null
          activo?: boolean
          email_verificado?: boolean
          ultimo_acceso?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

// Exportar tipos específicos
export type Categoria = Database['public']['Tables']['categorias']['Row']
export type Posicion = Database['public']['Tables']['posiciones']['Row']
export type EquipoInterno = Database['public']['Tables']['equipos_internos']['Row']
export type Jugador = Database['public']['Tables']['jugadores']['Row']
export type RolUsuario = Database['public']['Tables']['roles_usuario']['Row']
export type Usuario = Database['public']['Tables']['usuarios']['Row']
