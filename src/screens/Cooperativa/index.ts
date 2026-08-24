import { TScreens } from '../../navigation/screens.types'
import PerfilSocioScreen from './PerfilSocioScreen'
import SolicitudesSociosScreen from './SolicitudesSociosScreen'
import MisSolicitudesScreen from './MisSolicitudesScreen'
import NuevaSolicitudScreen from './NuevaSolicitudScreen'

// Las claves tienen que ser iguales al Route de Security.Menu o el menú cae en
// not_found. Las dos cuelgan del menú 1043 "Cooperativa".
export const ScreensCooperativa: TScreens = {
  // Menú 1044 "Perfil": el empleado pide afiliarse y ve su estado.
  self: {
    Screen: PerfilSocioScreen,
    Childs: {},
  },
  // Menú 1045 "Solicitudes de socios": aprobar o rechazar. Mismo nombre que el
  // KeyVar del acceso que la API exige para entrar.
  RequestSocio: {
    Screen: SolicitudesSociosScreen,
    Childs: {},
  },
  // Menú 1046 "Solicitudes": se le asigna al socio al aprobarse su afiliación.
  RequestCoo: {
    Screen: MisSolicitudesScreen,
    Childs: {
      // El formulario va como hijo, igual que nuevoGasto en Gastos de Viaje:
      // el botón del header navega acá y "atrás" regresa al listado.
      nuevaSolicitudCoo: NuevaSolicitudScreen,
    },
  },
}
