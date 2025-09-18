import { supabase } from './supabase'

// =====================================================
// FUNCIONES DE CATEGORÍAS
// =====================================================

export const categoriasService = {
  // Obtener todas las categorías activas
  async getAll() {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('activa', true)
      .order('edad_minima', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener una categoría por ID
  async getById(id) {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Crear nueva categoría
  async create(categoria) {
    const { data, error } = await supabase
      .from('categorias')
      .insert(categoria)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Actualizar categoría
  async update(id, updates) {
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
  async delete(id) {
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
  async getAll() {
    const { data, error } = await supabase
      .from('posiciones')
      .select('*')
      .eq('activa', true)
      .order('orden_campo', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener posiciones obligatorias
  async getObligatorias() {
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
  async getAll() {
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
  async getByCategoria(categoriaId) {
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
  async getById(id) {
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
  async create(equipo) {
    const { data, error } = await supabase
      .from('equipos_internos')
      .insert(equipo)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Actualizar equipo
  async update(id, updates) {
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
  async getAll() {
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
  async getByEquipo(equipoId) {
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
  async getByCategoria(categoriaId) {
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
  async getById(id) {
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
  async create(jugador) {
    const { data, error } = await supabase
      .from('jugadores')
      .insert(jugador)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Actualizar jugador
  async update(id, updates) {
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
  async delete(id) {
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
  async signIn(email, password) {
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

  // Registrar nuevo usuario (solo SuperAdmin)
  async signUp(email, password, userData) {
    // Verificar que el usuario actual sea SuperAdmin
    const currentUser = await this.getCurrentUser()
    if (!currentUser || currentUser.email !== 'ing.gustavo.cardenas@gmail.com') {
      throw new Error('No tienes permisos para crear usuarios. Solo el SuperAdministrador puede crear usuarios.')
    }
    
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
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// =====================================================
// FUNCIONES DE ROLES
// =====================================================

export const rolesService = {
  // Obtener todos los roles
  async getAll() {
    const { data, error } = await supabase
      .from('roles_usuario')
      .select('*')
      .eq('activo', true)
      .order('nivel_permisos', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Obtener roles de un usuario
  async getByUsuario(usuarioId) {
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

// =====================================================
// SERVICIO DE GESTIÓN DE USUARIOS
// =====================================================

export const usuariosService = {
  async getAll() {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        *,
        usuario_roles!inner(
          rol_id,
          categoria_id,
          equipo_interno_id,
          roles_usuario!inner(nombre, nivel_permisos),
          categorias(nombre),
          equipos_internos(nombre)
        )
      `)
      .eq('activo', true)
    
    if (error) throw error
    
    // Transformar los datos para facilitar el uso
    return data.map(usuario => ({
      ...usuario,
      rol: usuario.usuario_roles[0]?.roles_usuario?.nombre || 'Sin rol',
      categoria_nombre: usuario.usuario_roles[0]?.categorias?.nombre,
      equipo_nombre: usuario.usuario_roles[0]?.equipos_internos?.nombre
    }))
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        *,
        usuario_roles!inner(
          rol_id,
          categoria_id,
          equipo_interno_id,
          roles_usuario!inner(nombre, nivel_permisos),
          categorias(nombre),
          equipos_internos(nombre)
        )
      `)
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  async create(userData) {
    const { rol, categoria_id, equipo_interno_id, ...userInfo } = userData
    
    // Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userInfo.email,
      password: userInfo.password,
      email_confirm: true,
      user_metadata: {
        nombre: userInfo.nombre,
        apellido_paterno: userInfo.apellido_paterno,
        apellido_materno: userInfo.apellido_materno,
        telefono: userInfo.telefono
      }
    })
    
    if (authError) throw authError
    
    // Obtener el ID del rol
    const { data: rolData, error: rolError } = await supabase
      .from('roles_usuario')
      .select('id')
      .eq('nombre', this.getRoleName(rol))
      .single()
    
    if (rolError) throw rolError
    
    // Crear el registro en la tabla usuarios
    const { data: usuarioData, error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        email: userInfo.email,
        nombre: userInfo.nombre,
        apellido_paterno: userInfo.apellido_paterno,
        apellido_materno: userInfo.apellido_materno,
        telefono: userInfo.telefono,
        activo: true,
        email_verificado: true
      })
      .select()
      .single()
    
    if (usuarioError) throw usuarioError
    
    // Asignar el rol al usuario
    const { error: rolAsignacionError } = await supabase
      .from('usuario_roles')
      .insert({
        usuario_id: authData.user.id,
        rol_id: rolData.id,
        categoria_id: categoria_id || null,
        equipo_interno_id: equipo_interno_id || null,
        activo: true
      })
    
    if (rolAsignacionError) throw rolAsignacionError
    
    return usuarioData
  },

  async update(id, updates) {
    const { rol, categoria_id, equipo_interno_id, password, ...userInfo } = updates
    
    // Actualizar información del usuario
    const { data, error } = await supabase
      .from('usuarios')
      .update({
        ...userInfo,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    // Si se cambió la contraseña, actualizarla en Auth
    if (password) {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(id, {
        password: password
      })
      if (passwordError) throw passwordError
    }
    
    // Si se cambió el rol, actualizar la asignación
    if (rol) {
      const { data: rolData, error: rolError } = await supabase
        .from('roles_usuario')
        .select('id')
        .eq('nombre', this.getRoleName(rol))
        .single()
      
      if (rolError) throw rolError
      
      // Desactivar roles anteriores
      await supabase
        .from('usuario_roles')
        .update({ activo: false })
        .eq('usuario_id', id)
      
      // Crear nueva asignación de rol
      const { error: rolAsignacionError } = await supabase
        .from('usuario_roles')
        .insert({
          usuario_id: id,
          rol_id: rolData.id,
          categoria_id: categoria_id || null,
          equipo_interno_id: equipo_interno_id || null,
          activo: true
        })
      
      if (rolAsignacionError) throw rolAsignacionError
    }
    
    return data
  },

  async delete(id) {
    // Desactivar usuario en lugar de eliminar
    const { data, error } = await supabase
      .from('usuarios')
      .update({ 
        activo: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    // Desactivar roles del usuario
    await supabase
      .from('usuario_roles')
      .update({ activo: false })
      .eq('usuario_id', id)
    
    return data
  },

  getRoleName(rol) {
    const roleMap = {
      'admin_liga': 'Administrador de Liga',
      'admin_categoria': 'Administrador de Categoría',
      'admin_equipo': 'Administrador de Equipo',
      'padre_tutor': 'Padre de Familia'
    }
    return roleMap[rol] || rol
  }
}
