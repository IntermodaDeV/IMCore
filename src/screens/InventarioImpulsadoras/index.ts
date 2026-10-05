import { TScreens } from '../../navigation/screens.types'
import MisInventariosScreen from './MisInventariosScreen'
import EscanearScreen from './EscanearScreen'
import DashboardScreen from './DashboardScreen'
import MiAsistenciaScreen from './MiAsistenciaScreen'

// La key del nivel superior coincide con el Route del menú (invImpMisInventarios,
// Platform App; invImpDashboard, Platform Both). El padre 'inventarioImpulsadoras'
// solo agrupa en el menú.
export const ScreensInventarioImpulsadoras: TScreens = {
  invImpMisInventarios: {
    Screen: MisInventariosScreen,
    Childs: {
      invImpEscanear: EscanearScreen,
    },
  },
  invImpDashboard: {
    Screen: DashboardScreen,
  },
  // Asistencia de impulsadoras (antes «Impulsadora Check»): marcar inicio, almuerzo y fin, sin señal también.
  invImpMiAsistencia: {
    Screen: MiAsistenciaScreen,
  },
}
