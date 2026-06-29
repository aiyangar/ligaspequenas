import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { AcceptInvitePage } from '../auth/AcceptInvitePage'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireAdmin } from '../auth/RequireAdmin'
import { AppLayout } from './AppLayout'
import { PlaceholderPage } from './PlaceholderPage'
import { UsersPage } from '../users/UsersPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <PlaceholderPage title="Jugadores" /> },
          { path: 'quien-debe', element: <PlaceholderPage title="Quién debe" /> },
          {
            element: <RequireAdmin />,
            children: [{ path: 'usuarios', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
])
