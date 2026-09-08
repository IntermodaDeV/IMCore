import { TScreens } from '../../navigation/screens.types'
import PerfilSocioScreen from './PerfilSocioScreen'
import MisSolicitudesScreen from './MisSolicitudesScreen'
import NuevaSolicitudScreen from './NuevaSolicitudScreen'
import DetallePrestamoScreen from './DetallePrestamoScreen'
import SimuladorPrestamoScreen from './SimuladorPrestamoScreen'
import HistoricoPrestamosScreen from './HistoricoPrestamosScreen'
import AprobacionPrestamosScreen from './AprobacionPrestamosScreen'
import DetalleAprobacionScreen from './DetalleAprobacionScreen'
import ConfigAprobadoresScreen from './ConfigAprobadoresScreen'

// Las claves tienen que ser iguales al Route de Security.Menu o el menú cae en
// not_found. Las dos cuelgan del menú 1043 "Cooperativa".
export const ScreensCooperativa: TScreens = {
  // Menú 1044 "Perfil": el empleado pide afiliarse y ve su estado.
  self: {
    Screen: PerfilSocioScreen,
    Childs: {},
  },
  // Aprobación de solicitudes de préstamo.
  //
  // El Route sigue llamándose 'RequestSocio' porque se reusó el menú que era de
  // la aprobación de socios, un proceso que ya no existe. El nombre NO dice
  // quién entra: acá caen los dos niveles de aprobación, y la API filtra lo que
  // ve cada uno según su acceso — 'Aprobador1' ve todo el historial,
  // 'Aprobador2' solo las solicitudes donde lo asignaron.
  RequestSocio: {
    Screen: AprobacionPrestamosScreen,
    Childs: {
      // El detalle para resolver, como hijo: se llega desde el listado y
      // "atrás" regresa a él. Mismo patrón que nuevaSolicitudCoo.
      //
      // Reemplazó al diálogo de confirmación: con la tasa, las prestaciones y
      // la cadena, la decisión ya no cabía en un modal.
      detalleAprobacion: DetalleAprobacionScreen,
    },
  },
  // Configuración de aprobadores: cuántas firmas y quiénes, por tipo de
  // estructura contable. Mismo nombre que el KeyVar del acceso que la API
  // exige — es un acceso propio, no el de Aprobador1: aprobar un préstamo y
  // decidir cuántas firmas hacen falta son dos cosas distintas.
  ConfigAprobadores: {
    Screen: ConfigAprobadoresScreen,
    Childs: {},
  },
  // Menú 1046 "Solicitudes": se le asigna al socio al aprobarse su afiliación.
  RequestCoo: {
    Screen: MisSolicitudesScreen,
    Childs: {
      // El formulario va como hijo, igual que nuevoGasto en Gastos de Viaje:
      // el botón del header navega acá y "atrás" regresa al listado.
      nuevaSolicitudCoo: NuevaSolicitudScreen,
      // El plan de cuotas de un préstamo ya aprobado. Se llega con el botón
      // "Ver detalle" de su tarjeta.
      detallePrestamo: DetallePrestamoScreen,
      // El simulador: qué cuotas le tocarían si pidiera. No crea nada, así que
      // no necesita acceso propio — cuelga del mismo menú que las solicitudes.
      simuladorPrestamo: SimuladorPrestamoScreen,
      // Todos sus préstamos, incluidos los que no nacieron de una solicitud
      // del app — cargados en escritorio o migrados, que son la mayoría.
      historicoPrestamos: HistoricoPrestamosScreen,
    },
  },
}
