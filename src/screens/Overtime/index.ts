import { TScreens } from '../../navigation/screens.types'
import SolicitudesHorasExtraScreen from './SolicitudesHorasExtraScreen'
import MisSolicitudesHorasExtraScreen from './MisSolicitudesHorasExtraScreen'
import CrearSolicitudHoraExtraScreen from './CrearSolicitudHoraExtraScreen'
import RevisionHorasExtraScreen from './RevisionHorasExtraScreen'
import HistorialHorasExtraScreen from './HistorialHorasExtraScreen'
import DashboardHorasExtraScreen from './DashboardHorasExtraScreen'

export const ScreensOvertime: TScreens = {
  // Primer flujo: aprobar las horas que se solicitaron
  RequestHours: {
    Screen: SolicitudesHorasExtraScreen,
    Childs: {},
  },
  // Lo que el usuario PIDIÓ, semana por semana. Es la contraparte de
  // RequestHours: allá se firma lo de otros, acá se ve lo propio.
  MyRequestHours: {
    Screen: MisSolicitudesHorasExtraScreen,
    Childs: {
      // El formulario va como hijo, igual que nuevaSolicitudCoo en Cooperativa:
      // el botón del listado navega acá y "atrás" regresa a él.
      crearSolicitudHE: CrearSolicitudHoraExtraScreen,
    },
  },
  // Segundo flujo: autorizar la diferencia entre lo solicitado y el marcaje
  ReviewHours: {
    Screen: RevisionHorasExtraScreen,
    Childs: {},
  },
  // Bitácora local de IMCore con lo autorizado en los dos flujos
  HistoryHours: {
    Screen: HistorialHorasExtraScreen,
    Childs: {},
  },
  // Presupuesto de horas extra contra lo gastado, por área
  DashboardHE: {
    Screen: DashboardHorasExtraScreen,
    Childs: {},
  },
}
