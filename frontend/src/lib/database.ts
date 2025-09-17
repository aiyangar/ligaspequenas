import { supabase } from './supabase'
import type { Categoria, Posicion, EquipoInterno, Jugador, RolUsuario, Usuario } from './supabase'

// =====================================================
// FUNCIONES DE CATEGORÍAS
// =====================================================

export const categoriasService = {
  // Obtener todas las categorías activas
  async getAll(): Promise<Categoria[]> {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('activa', true)
      .order('edad_minima', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener una categoría por ID
  async getById(id: number): Promise<Categoria | null> {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Crear nueva categoría
  async create(categoria: Omit<Categoria, 'id' | 'created_at' | 'updated_at'>): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias')
      .insert(categoria)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Actualizar categoría
  async update(id: number, updates: Partial<Categoria>): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Eliminar categoría (soft delete)
  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('categorias')
      .update({ activa: false })
      .eq('id', id)

    if (error) throw error
  }
}

// =====================================================
// FUNCIONES DE POSICIONES
// =====================================================

export const posicionesService = {
  // Obtener todas las posiciones activas
  async getAll(): Promise<Posicion[]> {
    const { data, error } = await supabase
      .from('posiciones')
      .select('*')
      .eq('activa', true)
      .order('orden_campo', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener posiciones obligatorias
  async getObligatorias(): Promise<Posicion[]> {
    const { data, error } = await supabase
      .from('posiciones')
      .select('*')
      .eq('activa', true)
      .eq('es_obligatoria', true)
      .order('orden_campo', { ascending: true })

    if (error) throw error
    return data || []
  }
}

// =====================================================
// FUNCIONES DE EQUIPOS INTERNOS
// =====================================================

export const equiposInternosService = {
  // Obtener todos los equipos activos
  async getAll(): Promise<EquipoInterno[]> {
    const { data, error } = await supabase
      .from('equipos_internos')
      .select(`
        *,
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener equipos por categoría
  async getByCategoria(categoriaId: number): Promise<EquipoInterno[]> {
    const { data, error } = await supabase
      .from('equipos_internos')
      .select(`
        *,
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('categoria_id', categoriaId)
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener un equipo por ID
  async getById(id: number): Promise<EquipoInterno | null> {
    const { data, error } = await supabase
      .from('equipos_internos')
      .select(`
        *,
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Crear nuevo equipo
  async create(equipo: Omit<EquipoInterno, 'id' | 'created_at' | 'updated_at'>): Promise<EquipoInterno> {
    const { data, error } = await supabase
      .from('equipos_internos')
      .insert(equipo)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Actualizar equipo
  async update(id: number, updates: Partial<EquipoInterno>): Promise<EquipoInterno> {
    const { data, error } = await supabase
      .from('equipos_internos')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }
}

// =====================================================
// FUNCIONES DE JUGADORES
// =====================================================

export const jugadoresService = {
  // Obtener todos los jugadores activos
  async getAll(): Promise<Jugador[]> {
    const { data, error } = await supabase
      .from('jugadores')
      .select(`
        *,
        equipos_internos (
          id,
          nombre,
          color_uniforme
        ),
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('activo', true)
      .order('apellido_paterno', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener jugadores por equipo
  async getByEquipo(equipoId: number): Promise<Jugador[]> {
    const { data, error } = await supabase
      .from('jugadores')
      .select(`
        *,
        equipos_internos (
          id,
          nombre,
          color_uniforme
        ),
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('equipo_interno_id', equipoId)
      .eq('activo', true)
      .order('numero_playera', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener jugadores por categoría
  async getByCategoria(categoriaId: number): Promise<Jugador[]> {
    const { data, error } = await supabase
      .from('jugadores')
      .select(`
        *,
        equipos_internos (
          id,
          nombre,
          color_uniforme
        ),
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('categoria_id', categoriaId)
      .eq('activo', true)
      .order('apellido_paterno', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener un jugador por ID
  async getById(id: number): Promise<Jugador | null> {
    const { data, error } = await supabase
      .from('jugadores')
      .select(`
        *,
        equipos_internos (
          id,
          nombre,
          color_uniforme
        ),
        categorias (
          id,
          nombre,
          edad_minima,
          edad_maxima
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Crear nuevo jugador
  async create(jugador: Omit<Jugador, 'id' | 'edad' | 'created_at' | 'updated_at'>): Promise<Jugador> {
    const { data, error } = await supabase
      .from('jugadores')
      .insert(jugador)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Actualizar jugador
  async update(id: number, updates: Partial<Jugador>): Promise<Jugador> {
    const { data, error } = await supabase
      .from('jugadores')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Eliminar jugador (soft delete)
  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('jugadores')
      .update({ activo: false })
      .eq('id', id)

    if (error) throw error
  }
}

// =====================================================
// FUNCIONES DE AUTENTICACIÓN
// =====================================================

export const authService = {
  // Obtener usuario actual
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },

  // Iniciar sesión
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
    return data
  },

  // Cerrar sesión
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // Registrar nuevo usuario
  async signUp(email: string, password: string, userData: {
    nombre: string
    apellido_paterno: string
    apellido_materno?: string
    telefono?: string
  }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    })
    if (error) throw error
    return data
  },

  // Escuchar cambios de autenticación
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// =====================================================
// FUNCIONES DE ROLES
// =====================================================

export const rolesService = {
  // Obtener todos los roles
  async getAll(): Promise<RolUsuario[]> {
    const { data, error } = await supabase
      .from('roles_usuario')
      .select('*')
      .eq('activo', true)
      .order('nivel_permisos', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener roles de un usuario
  async getByUsuario(usuarioId: string) {
    const { data, error } = await supabase
      .from('usuario_roles')
      .select(`
        *,
        roles_usuario (
          id,
          nombre,
          descripcion,
          nivel_permisos,
          permisos
        ),
        categorias (
          id,
          nombre
        ),
        equipos_internos (
          id,
          nombre
        )
      `)
      .eq('usuario_id', usuarioId)
      .eq('activo', true)

    if (error) throw error
    return data || []
  }
}
