import { TScreens } from '../../navigation/screens.types'
import MantenimientoDashboardScreen from './MantenimientoDashboardScreen'
import TicketsListScreen from './Tickets/TicketsListScreen'
import NewTicketScreen from './Tickets/NewTicketScreen'
import TicketDetailScreen from './Tickets/TicketDetailScreen'
import TiposParoScreen from './Catalogos/TiposParoScreen'
import EstructuraScreen from './Catalogos/EstructuraScreen'

// La key debe coincidir con el `Route` del item de menú en la BD de seguridad.
export const ScreensMantenimiento: TScreens = {
  mantenimientoDashboard: {
    Screen: MantenimientoDashboardScreen,
    Childs: {},
  },
  mantenimientoTickets: {
    Screen: TicketsListScreen,
    Childs: {
      // Pantallas internas (navegadas desde la lista).
      mantenimientoTicketNuevo: NewTicketScreen,
      mantenimientoTicketDetalle: TicketDetailScreen,
    },
  },
  // Catálogos (gateados por permiso de menú).
  mantenimientoEstructura: { Screen: EstructuraScreen, Childs: {} },  // Áreas y operaciones (árbol)
  mantenimientoTiposParo: { Screen: TiposParoScreen, Childs: {} },
}
