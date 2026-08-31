import { TScreens } from '../../navigation/screens.types'
import VisitasGenerarScreen from './VisitasGenerarScreen'
import VisitasHistorialScreen from './VisitasHistorialScreen'
import VisitasHorariosScreen from './VisitasHorariosScreen'
import VisitasMotivosScreen from './VisitasMotivosScreen'
import VisitasTableroScreen from './VisitasTableroScreen'
import VisitasValidarScreen from './VisitasValidarScreen'

// Las keys deben coincidir con el `Route` del menú en la BD de Security.
export const ScreensVisitas: TScreens = {
  // La misma opción de menú que el tablero del web ('visitasDashboard'), con
  // Platform = 'Both': es la misma pregunta y el mismo permiso, con el recorte
  // que cabe en un teléfono.
  visitasDashboard: {
    Screen: VisitasTableroScreen,
    Childs: {},
  },
  visitasGenerar: {
    Screen: VisitasGenerarScreen,
    Childs: {},
  },
  visitasHistorial: {
    Screen: VisitasHistorialScreen,
    Childs: {},
  },
  visitasMotivos: {
    Screen: VisitasMotivosScreen,
    Childs: {},
  },
  visitasHorarios: {
    Screen: VisitasHorariosScreen,
    Childs: {},
  },
  visitasValidar: {
    Screen: VisitasValidarScreen,
    Childs: {},
  },
}
