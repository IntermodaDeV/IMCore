import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  ICatalogosSolicitud,
  IEstadoCuenta,
  ICrearSolicitud,
  IEmpleadoSinAfiliacion,
  IEstadoAfiliacion,
  ISolicitudCliente,
  ISolicitudSocio,
  ISolicitudPrestamo,
  IEditarSolicitud,
  IAprobadorSolicitud,
  IAprobadorDisponible,
  IResolverPrestamo,
  IResolverPrestamosResult,
  IConfiguracionAprobadores,
  IGuardarConfiguracionAprobadores,
  IUsuarioBusqueda,
  ICadenaConfigurada,
  ITasaInteres,
  IPrestacionEmpleado,
  ICuotaPrestamo,
  ICuotaSimulada,
  IPrestamoResumen,
} from './cooperativa.types'

// Consume los endpoints de api/CooInter. La consulta de planilla la reenvía
// IMCoreApi a IMCoreProxy (SP del esquema CooInter); las solicitudes viven en
// IMCore. baseUrl ya incluye /api/, por eso la ruta va como 'CooInter/…'.
//
// Ninguna de las tres manda datos del empleado ni códigos: los resuelve el
// servidor desde el token. El SP de planilla devuelve datos personales, así que
// mandarlos desde acá permitiría consultar o guardar los de otro empleado.
const schema = 'CooInter'

export const cooperativaService = {
  /**
   * Todo lo que la pantalla necesita al abrirse: si el usuario aplica para
   * afiliarse y si ya tiene una solicitud en curso.
   */
  getEstadoAfiliacion: () =>
    httpClient.get<ExecutionResponse<IEstadoAfiliacion>>(`${schema}/EstadoAfiliacion`),

  /**
   * Crea la solicitud de afiliación. Sin cuerpo: el servidor vuelve a pedir los
   * datos a planilla antes de guardar.
   *
   * Devuelve la solicitud ya creada, con el estado resuelto.
   */
  /** El aporte es lo unico que manda la pantalla: el resto lo resuelve la API. */
  /**
   * Solicitudes de prestamo pendientes de aprobacion.
   * Requiere el acceso 'Aprobador1' del lado del servidor.
   */
  getSolicitudesPrestamo: (statusCode?: string) =>
    httpClient.get<ExecutionResponse<ISolicitudPrestamo[]>>(
      `${schema}/SolicitudesPrestamo${statusCode ? `?statusCode=${encodeURIComponent(statusCode)}` : ''}`,
    ),

  /** Las solicitudes de prestamo del propio usuario que siguen en revision. */
  getMisSolicitudesPrestamo: () =>
    httpClient.get<ExecutionResponse<ISolicitudPrestamo[]>>(`${schema}/MisSolicitudesPrestamo`),

  crearSolicitudSocio: (aporte: number) =>
    httpClient.post<ExecutionResponse<ISolicitudSocio>, { Aporte: number }>(
      `${schema}/SolicitudSocio`,
      { Aporte: aporte },
    ),

  /**
   * Solicitudes que el socio ha hecho en Cooperativa.
   *
   * Sin parametros: el codigo de personal lo resuelve el servidor desde el
   * token. Una lista vacia significa que todavia no ha hecho ninguna.
   */
  getSolicitudesCliente: () =>
    httpClient.get<ExecutionResponse<ISolicitudCliente[]>>(`${schema}/SolicitudesCliente`),

  /**
   * Estado de cuenta del socio. Sin parametros: el codigo de personal lo
   * resuelve el servidor desde el token.
   */
  getEstadoCuenta: () =>
    httpClient.get<ExecutionResponse<IEstadoCuenta>>(`${schema}/EstadoCuenta`),

  /** Catalogos (tipos y plazos) del formulario de solicitud. */
  getCatalogosSolicitud: () =>
    httpClient.get<ExecutionResponse<ICatalogosSolicitud>>(`${schema}/CatalogosSolicitud`),

  /**
   * Crea la solicitud del socio. Nace en Pendiente; el estado no se manda desde
   * acá, lo fija el servidor.
   */
  crearSolicitud: (data: ICrearSolicitud) =>
    httpClient.post<ExecutionResponse<number | null>, ICrearSolicitud>(
      `${schema}/CrearSolicitud`,
      data,
    ),

  /**
   * Edita una solicitud propia. La API la rechaza si ya no esta pendiente o si
   * no es del usuario del token.
   */
  editarSolicitud: (data: IEditarSolicitud) =>
    httpClient.put<ExecutionResponse<number | null>, IEditarSolicitud>(
      `${schema}/SolicitudPrestamo`,
      data,
    ),

  /**
   * La configuracion de aprobacion por tipo de estructura contable.
   * Requiere el acceso 'ConfigAprobadores' del lado del servidor.
   */
  getConfiguracionAprobadores: () =>
    httpClient.get<ExecutionResponse<IConfiguracionAprobadores[]>>(
      `${schema}/ConfiguracionAprobadores`,
    ),

  /** Guarda la configuracion de UN tipo. */
  guardarConfiguracionAprobadores: (data: IGuardarConfiguracionAprobadores) =>
    httpClient.put<ExecutionResponse<boolean>, IGuardarConfiguracionAprobadores>(
      `${schema}/ConfiguracionAprobadores`,
      data,
    ),

  /**
   * Busca usuarios para configurar como aprobadores.
   *
   * Cualquier usuario activo, no solo los que tienen un acceso: configurar es
   * justamente decidir quién va a poder firmar. Viene con tope porque son
   * cientos — la pantalla busca, no lista.
   *
   * Requiere el acceso 'ConfigAprobadores' del lado del servidor.
   */
  buscarUsuarios: (filtro: string, top = 25) =>
    httpClient.get<ExecutionResponse<IUsuarioBusqueda[]>>(
      `${schema}/BuscarUsuarios?filtro=${encodeURIComponent(filtro)}&top=${top}`,
    ),

  /**
   * La cadena que le toca a cada solicitud del lote según la configuración de
   * su solicitante.
   *
   * Reemplaza a getAprobadoresDisponibles: los candidatos ya no son "los que
   * tienen el acceso Aprobador2" sino los configurados para la combinación de
   * quien pide (tipo de planilla + tipo de área).
   *
   * Requiere el acceso 'Aprobador1' del lado del servidor.
   */
  getCadenasConfiguradas: (ids: number[]) =>
    httpClient.get<ExecutionResponse<ICadenaConfigurada[]>>(
      `${schema}/CadenasConfiguradas?ids=${ids.join(',')}`,
    ),

  /**
   * Quienes pueden elegirse como siguientes aprobadores, por acceso.
   *
   * Superado por getCadenasConfiguradas. Se deja porque el endpoint sigue
   * existiendo para las versiones ya publicadas.
   */
  getAprobadoresDisponibles: () =>
    httpClient.get<ExecutionResponse<IAprobadorDisponible[]>>(`${schema}/AprobadoresDisponibles`),

  /**
   * Deja la cadena de una solicitud como diga la lista: agrega a los que falten
   * y saca a los que sobren.
   *
   * Se manda la lista COMPLETA — "estos son los que tienen que firmar" — porque
   * es lo que la pantalla sabe: casillas marcadas y desmarcadas.
   *
   * Solo el primer aprobador y solo mientras siga en aprobación. Al que entra le
   * llega el aviso de que tiene una por aprobar; al que sale, el de que ya no
   * hace falta su firma. Si al editarla la cadena queda completa, la solicitud
   * se cierra y viaja a la cooperativa.
   */
  actualizarCadena: (id: number, aprobadores: string[]) =>
    httpClient.put<ExecutionResponse<string>, { Id: number; Aprobadores: string[] }>(
      `${schema}/CadenaPrestamo`,
      { Id: id, Aprobadores: aprobadores },
    ),

  /**
   * Las tasas de interés entre las que puede elegir quien aprueba.
   *
   * Viene VACÍA si no tiene el acceso 'ElegirTasaInteres' o no es del primer
   * nivel — no es un error: la pantalla simplemente no muestra el selector y el
   * préstamo va con la tasa principal.
   */
  getTasasInteres: () =>
    httpClient.get<ExecutionResponse<ITasaInteres[]>>(`${schema}/TasasInteres`),

  /**
   * Las prestaciones de los solicitantes: con qué respaldo cuentan si salieran
   * hoy. Es solo para decidir; no se guarda nada.
   *
   * Viene VACÍA si no tiene el acceso 'VerPrestaciones' o no es del primer
   * nivel. Los códigos de planilla los resuelve el servidor desde la solicitud:
   * acá solo viajan los Ids.
   */
  getPrestaciones: (ids: number[]) =>
    httpClient.get<ExecutionResponse<IPrestacionEmpleado[]>>(
      `${schema}/Prestaciones?ids=${ids.join(',')}`,
    ),

  /**
   * El estado de cuenta del SOLICITANTE de una solicitud: lo que tiene ahorrado
   * contra lo que ya debe.
   *
   * Va con el mismo acceso que las prestaciones ('VerPrestaciones') — las dos
   * son la situación financiera de una persona — y viene null si no lo tiene.
   * El código de planilla lo resuelve el servidor desde la solicitud.
   */
  /**
   * El plan de cuotas del préstamo de una solicitud del socio.
   *
   * Se pide por SolicitudId, que es lo que el socio ve en su lista. El código
   * de planilla lo pone el servidor desde el token, así que solo devuelve el
   * plan de SUS préstamos.
   *
   * Lista vacía = esa solicitud no tiene préstamo (se rechazó, o todavía no
   * viajó a la cooperativa). No es error.
   */
  getPrestamoDetalle: (solicitudId: number) =>
    httpClient.get<ExecutionResponse<ICuotaPrestamo[]>>(
      `${schema}/PrestamoDetalle/${solicitudId}`,
    ),

  /**
   * Todos los préstamos del socio, con el resumen de cómo va cada uno.
   *
   * Incluye los que NO nacieron de una solicitud del app: cargados en el
   * sistema de escritorio o migrados. Son la mayoría.
   *
   * Sin parámetros: el código de planilla lo resuelve el servidor desde el
   * token, así que solo devuelve los suyos.
   */
  getPrestamosCliente: () =>
    httpClient.get<ExecutionResponse<IPrestamoResumen[]>>(`${schema}/PrestamosCliente`),

  /**
   * El plan de cuotas de UN préstamo, por PrestamoId.
   *
   * Para los del histórico, que no tienen solicitud y por lo tanto no se
   * pueden pedir con getPrestamoDetalle. Mandar el PrestamoId es seguro
   * porque el servidor comprueba con el token que el préstamo sea suyo.
   */
  getPrestamoDetallePorId: (prestamoId: number) =>
    httpClient.get<ExecutionResponse<ICuotaPrestamo[]>>(
      `${schema}/PrestamoDetallePorId/${prestamoId}`,
    ),

  /**
   * Simula un préstamo: qué cuotas y qué fechas le tocarían si le aprobaran
   * ese monto a ese plazo. No crea nada.
   *
   * La tasa NO se manda: la fija el servidor. Si viajara desde acá, cualquiera
   * podría simular al 0% y después reclamar esa cuota.
   *
   * Lo calcula la MISMA función que arma el plan real al aprobarse, así que lo
   * que ve acá es lo que va a pagar.
   */
  simularPrestamo: (monto: number, plazoId: number) =>
    httpClient.get<ExecutionResponse<ICuotaSimulada[]>>(
      `${schema}/SimularPrestamo?monto=${monto}&plazoId=${plazoId}`,
    ),

  getEstadoCuentaSolicitante: (id: number) =>
    httpClient.get<ExecutionResponse<IEstadoCuenta | null>>(
      `${schema}/EstadoCuentaSolicitante?id=${id}`,
    ),

  /** La cadena de aprobaciones de una solicitud. */
  getAprobacionesPrestamo: (id: number) =>
    httpClient.get<ExecutionResponse<IAprobadorSolicitud[]>>(
      `${schema}/AprobacionesPrestamo/${id}`,
    ),

  /**
   * Aprueba o rechaza una solicitud. El camino (primer nivel o siguiente) lo
   * decide el servidor segun el acceso de quien llama.
   */
  resolverPrestamo: (data: IResolverPrestamo) =>
    httpClient.post<ExecutionResponse<IResolverPrestamosResult>, IResolverPrestamo>(
      `${schema}/ResolverPrestamo`,
      data,
    ),

  /** Una solicitud propia, para llenar el formulario al editar. */
  getSolicitudPrestamo: (id: number) =>
    httpClient.get<ExecutionResponse<ISolicitudPrestamo>>(`${schema}/SolicitudPrestamo/${id}`),

  /**
   * Solo los datos de planilla, sin el estado de la solicitud. La pantalla usa
   * getEstadoAfiliacion; esta queda para consultas puntuales.
   */
  getEmpleadoSinAfiliacion: () =>
    httpClient.get<ExecutionResponse<IEmpleadoSinAfiliacion>>(`${schema}/EmpleadoSinAfiliacion`),
}
