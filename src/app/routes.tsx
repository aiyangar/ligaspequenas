import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { AuthCallbackPage } from '../auth/AuthCallbackPage'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireAdmin } from '../auth/RequireAdmin'
import { AppLayout } from './AppLayout'
import { PlaceholderPage } from './PlaceholderPage'
import { UsersPage } from '../users/UsersPage'
import { PlayerFormPage } from '../players/PlayerFormPage'
import { PlayersPage } from '../players/PlayersPage'
import { TeamsPage } from '../teams/TeamsPage'
import { TeamDetailPage } from '../teams/TeamDetailPage'
import { TeamFormPage } from '../teams/TeamFormPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <PlayersPage /> },
          { path: 'jugadores/:id', element: <PlayerFormPage /> },
          { path: 'quien-debe', element: <PlaceholderPage title="Quién debe" /> },
          { path: 'equipos', element: <TeamsPage /> },
          { path: 'equipos/:id', element: <TeamDetailPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'jugadores/nuevo', element: <PlayerFormPage /> },
              { path: 'usuarios', element: <UsersPage /> },
              { path: 'equipos/nuevo', element: <TeamFormPage /> },
              { path: 'equipos/:id/editar', element: <TeamFormPage /> },
            ],
          },
        ],
      },
    ],
  },
])
