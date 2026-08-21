import { TScreens } from '../../navigation/screens.types'
import VisitasGenerarScreen from './VisitasGenerarScreen'
import VisitasHistorialScreen from './VisitasHistorialScreen'
import VisitasHorariosScreen from './VisitasHorariosScreen'
import VisitasMotivosScreen from './VisitasMotivosScreen'
import VisitasValidarScreen from './VisitasValidarScreen'

// Las keys deben coincidir con el `Route` del menú en la BD de Security.
export const ScreensVisitas: TScreens = {
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
