import { TScreens } from '../../navigation/screens.types'
import MantenimientoDashboardScreen from './MantenimientoDashboardScreen'
import TicketsListScreen from './Tickets/TicketsListScreen'
import NewTicketScreen from './Tickets/NewTicketScreen'
import TicketDetailScreen from './Tickets/TicketDetailScreen'
import AreasScreen from './Catalogos/AreasScreen'
import OperacionesScreen from './Catalogos/OperacionesScreen'
import TiposParoScreen from './Catalogos/TiposParoScreen'

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
  mantenimientoAreas: { Screen: AreasScreen, Childs: {} },
  mantenimientoOperaciones: { Screen: OperacionesScreen, Childs: {} },
  mantenimientoTiposParo: { Screen: TiposParoScreen, Childs: {} },
}
