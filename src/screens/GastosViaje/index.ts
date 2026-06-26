import { TScreens } from '../../navigation/screens.types'
import HistorialGastosScreen from './HistorialGastosScreen'
import NuevoGastoScreen from './NuevoGastoScreen'
import DetalleGastoScreen from './DetalleGastoScreen'
import SolicitarProveedorScreen from './SolicitarProveedorScreen'
import AprobacionGastosScreen from './AprobacionGastosScreen'

export const ScreensGastosViaje: TScreens = {
  gastosViaje: {
    Screen: HistorialGastosScreen,
    Childs: {
      nuevoGasto: NuevoGastoScreen,
      detalleGasto: DetalleGastoScreen,
      solicitarProveedor: SolicitarProveedorScreen
    },
  },
  solicitarProveedor: {
    Screen: SolicitarProveedorScreen,
    Childs: {}
  },
  aprobacionGastos: {
    Screen: AprobacionGastosScreen,
    Childs: {},
  }
}
