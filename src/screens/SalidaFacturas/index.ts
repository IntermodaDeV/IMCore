import { TScreens } from '../../navigation/screens.types'
import SalidaFacturaScreen from './SalidaFacturaScreen'
import SalidaFacturasHistorialScreen from './SalidaFacturasHistorialScreen'

// Las keys deben coincidir con el `Route` del ítem de menú en la BD de Security
// (ver Persistance/Scripts/Facturas_03_Menu.sql).
export const ScreensSalidaFacturas: TScreens = {
  salidaFacturas: {
    Screen: SalidaFacturaScreen,
    Childs: {},
  },
  salidaFacturasHistorial: {
    Screen: SalidaFacturasHistorialScreen,
    Childs: {},
  },
}
