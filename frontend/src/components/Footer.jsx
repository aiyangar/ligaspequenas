import React from 'react'

export const Footer = () => {
  return (
    <footer className="material-footer">
      <div className="container-responsive">
        <div className="py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Logo y descripción */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-white font-bold text-lg">⚾</span>
                </div>
                <span className="text-xl font-bold text-white">
                  Ligas Pequeñas
                </span>
              </div>
              <p className="text-gray-300 text-sm max-w-md">
                Sistema de gestión integral para ligas de béisbol pequeñas. 
                Administra categorías, equipos, jugadores y partidos de manera eficiente.
              </p>
            </div>

            {/* Enlaces rápidos */}
            <div>
              <h3 className="text-white font-semibold mb-4">Enlaces Rápidos</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="#"
                    className="text-gray-300 hover:text-white text-sm transition-colors duration-200"
                  >
                    Dashboard
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-300 hover:text-white text-sm transition-colors duration-200"
                  >
                    Categorías
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-300 hover:text-white text-sm transition-colors duration-200"
                  >
                    Equipos
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-300 hover:text-white text-sm transition-colors duration-200"
                  >
                    Jugadores
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-300 hover:text-white text-sm transition-colors duration-200"
                  >
                    Partidos
                  </a>
                </li>
              </ul>
            </div>

            {/* Información de contacto */}
            <div>
              <h3 className="text-white font-semibold mb-4">Contacto</h3>
              <ul className="space-y-2">
                <li className="text-gray-300 text-sm">
                  📧 info@ligaspequenas.com
                </li>
                <li className="text-gray-300 text-sm">
                  📞 +52 (555) 123-4567
                </li>
                <li className="text-gray-300 text-sm">
                  📍 Ciudad de México, México
                </li>
              </ul>
            </div>
          </div>

          {/* Línea divisoria */}
          <div className="border-t border-gray-700 mt-8 pt-6">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="text-gray-400 text-sm">
                © 2024 Ligas Pequeñas. Todos los derechos reservados.
              </div>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <a
                  href="#"
                  className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
                >
                  Política de Privacidad
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
                >
                  Términos de Servicio
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
                >
                  Ayuda
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}