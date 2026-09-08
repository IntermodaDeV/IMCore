import { TScreens } from '../../navigation/screens.types'
import SolicitudesListScreen from './SolicitudesListScreen'
import NuevaSolicitudScreen from './NuevaSolicitudScreen'
import SolicitudDetailScreen from './SolicitudDetailScreen'

// La key del nivel superior tiene que coincidir con el Route del ítem de menú en
// la BD (Security.Menu.Route = 'solicitudesRepuestos'); las hijas las aplana
// App.tsx como Stack.Screen.
export const ScreensSolicitudesRepuestos: TScreens = {
  solicitudesRepuestos: {
    Screen: SolicitudesListScreen,
    Childs: {
      solicitudesRepuestosNueva: NuevaSolicitudScreen,
      solicitudesRepuestosDetalle: SolicitudDetailScreen,
    },
  },
}
