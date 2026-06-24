import { TScreens } from '../../navigation/screens.types'
import MantenimientoDashboardScreen from './MantenimientoDashboardScreen'
import TicketsListScreen from './Tickets/TicketsListScreen'

// La key debe coincidir con el `Route` del item de menú en la BD de seguridad.
export const ScreensMantenimiento: TScreens = {
  mantenimientoDashboard: {
    Screen: MantenimientoDashboardScreen,
    Childs: {},
  },
  mantenimientoTickets: {
    Screen: TicketsListScreen,
    // Detalle y formularios (Nuevo/Editar) se agregan en el siguiente paso.
    Childs: {},
  },
}
