import { TScreens } from '../../navigation/screens.types'
import MantenimientoDashboardScreen from './MantenimientoDashboardScreen'

// La key debe coincidir con el `Route` del item de menú en la BD de seguridad.
export const ScreensMantenimiento: TScreens = {
  mantenimientoDashboard: {
    Screen: MantenimientoDashboardScreen,
    Childs: {},
  },
}
