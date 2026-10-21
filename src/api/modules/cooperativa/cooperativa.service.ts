import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IAfiliacionResult,
  ICatalogosSolicitud,
  IClienteCooperativa,
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
  IResolverAprobacion,
  IResolverAprobacionResult,
  IConfiguracionAprobadores,
  IGuardarConfiguracionAprobadores,
  IUsuarioBusqueda,
  ICadenaConfigurada,
  ITasaInteres,
  IPrestacionEmpleado,
  ICuotaPrestamo,
  ICuotaSimulada,
  IPrestamoResumen,
  IOpcionCuota,
  ICrearSolicitudResult,
  ITipoSolicitud,
  ICuotaPlan,
  ILimitesPrestamo,
  ISolicitudPorAprobar,
  IDetalleAprobacion,
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
   * ¿Ya es socio? Lo primero que se pregunta al abrir el módulo.
   *
   * Va derecho a la base de Cooperativa. La respuesta se lee así:
   *
   *   Success && Data   ->  ya es socio, se muestra su información
   *   Success && !Data  ->  todavía no, se muestra "quiero ser socio"
   *   !Success          ->  no se pudo consultar: es un ERROR, no un "no es socio"
   *
   * Esa última distinción importa: si una caída se leyera como "no es socio",
   * a un socio se le ofrecería afiliarse de nuevo.
   */
  getClienteCooperativa: () =>
    httpClient.get<ExecutionResponse<IClienteCooperativa | null>>(
      `${schema}/ClienteCooperativa`,
    ),

  /**
   * Todo lo que la pantalla necesita al abrirse: si el usuario aplica para
   * afiliarse y si ya tiene una solicitud en curso.
   *
   * @deprecated Se apoyaba en el esquema CooInter de IMCore, que ya no existe.
   * Lo reemplaza getClienteCooperativa.
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

  /**
   * Afilia al usuario. Al volver con Success queda socio y su cuenta abierta.
   *
   * Solo manda el aporte. Identidad, empresa y planilla las resuelve el
   * servidor contra nómina: mandarlas desde acá dejaría afiliar a alguien con
   * datos que no son los suyos.
   */
  crearSolicitudSocio: (aporte: number) =>
    httpClient.post<ExecutionResponse<IAfiliacionResult>, { Aporte: number }>(
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
   * Los tipos de solicitud de la empresa del socio.
   *
   * Aparte de `getCatalogosSolicitud`, que trae tipos Y plazos: el formulario
   * ya no usa los plazos — el plazo sale del monto y de la cuota — y mientras
   * venían juntos, que faltara el SP de plazos tumbaba también los tipos y la
   * pantalla no cargaba por un dato que ni siquiera iba a mostrar.
   */
  getTiposSolicitud: () =>
    httpClient.get<ExecutionResponse<ITipoSolicitud[]>>(`${schema}/TiposSolicitud`),

  /**
   * Las solicitudes donde el usuario autenticado es firmante, con el grupo al
   * que pertenece cada una según lo que ÉL hizo.
   *
   * No recibe el usuario: lo resuelve el servidor desde el token. Si viajara
   * desde acá, cualquiera podría ver — y mañana resolver — las solicitudes
   * asignadas a otro aprobador.
   */
  getSolicitudesPorAprobador: () =>
    httpClient.get<ExecutionResponse<ISolicitudPorAprobar[]>>(
      `${schema}/SolicitudesPorAprobador`,
    ),

  /**
   * Todo lo que el aprobador necesita de una solicitud: la solicitud, el
   * empleado con su centro de costos, su liquidación y el plan de pagos.
   *
   * Si la solicitud no está asignada al usuario del token, el servidor no
   * devuelve nada: son datos de nómina y de plata de otra persona.
   */
  getDetalleAprobacion: (solicitudId: number) =>
    httpClient.get<ExecutionResponse<IDetalleAprobacion>>(
      `${schema}/DetalleAprobacion?solicitudId=${solicitudId}`,
    ),

  /**
   * Graba la firma del aprobador sobre una solicitud.
   *
   * Quién firma NO va en el cuerpo: lo resuelve el servidor desde el token.
   * Mandarlo desde acá dejaría firmar en nombre de otro.
   *
   * Un "no se pudo" —ya firmó, no le toca todavía, otro la resolvió primero—
   * vuelve como `Success: false` con el motivo en `ErrorMessage`, no como un
   * error de red: son cosas que pasan y hay que poder decirlas con palabras.
   */
  resolverAprobacion: (info: IResolverAprobacion) =>
    httpClient.post<ExecutionResponse<IResolverAprobacionResult>>(
      `${schema}/ResolverSolicitud`,
      info,
    ),

  /**
   * El plan de cuotas de una solicitud que ya existe.
   *
   * Es una RECONSTRUCCIÓN, no una copia: la tasa y el monto total no se
   * guardan con la solicitud, así que el servidor los vuelve a resolver — la
   * tasa de referencia de hoy y, si es refinanciamiento, el saldo de hoy. Por
   * eso la pantalla lo presenta como estimado.
   */
  getPlanCuotasSolicitud: (solicitudId: number) =>
    httpClient.get<ExecutionResponse<ICuotaPlan[]>>(
      `${schema}/PlanCuotasSolicitud?solicitudId=${solicitudId}`,
    ),

  /**
   * Hasta cuánto puede pedir el socio, por los tramos configurados para su
   * empresa y su tipo de planilla. Se consulta una vez al abrir el formulario.
   */
  getLimitesPrestamo: () =>
    httpClient.get<ExecutionResponse<ILimitesPrestamo>>(`${schema}/LimitesPrestamo`),

  /**
   * El plan de cuotas de una opción: cuánto, cuándo, y cuánto va a capital y a
   * intereses en cada pago.
   *
   * Los parámetros salen de la opción elegida — no de lo que el socio escribió
   * — porque el servidor ya los resolvió al calcular las opciones. Con los
   * mismos números el plan cuadra con el total que vio.
   */
  getPlanCuotas: (
    monto: number,
    tasaAnual: number,
    plazo: number,
    tipoPlazo: number,
    opciones?: {
      /**
       * Quien pregunta es un FIRMANTE, no el dueño de la solicitud.
       *
       * Cambia de quién salen las fechas: el calendario de cuotas se arma con
       * el calendario de planilla de la EMPRESA DEL SOCIO. Con el código del
       * que mira, un aprobador de otra planilla veía otras fechas. Requiere
       * `solicitudId`.
       */
      solicitudId?: number | null
      comoAprobador?: boolean
      /**
       * Desde cuándo se proyectan las cuotas. Sin esto, hoy.
       *
       * Lo manda el último firmante con su fecha de otorgamiento, que es la
       * misma que recibe el servidor al crear el préstamo: así las fechas que
       * ve en pantalla son las que van a quedar grabadas.
       */
      desde?: string | null
    },
  ) => {
    const params = new URLSearchParams({
      monto: String(monto),
      tasaAnual: String(tasaAnual),
      plazo: String(plazo),
      tipoPlazo: String(tipoPlazo),
    })
    if (opciones?.solicitudId != null && opciones.solicitudId > 0) {
      params.append('solicitudId', String(opciones.solicitudId))
    }
    if (opciones?.comoAprobador) {
      params.append('comoAprobador', 'true')
    }
    if (opciones?.desde) {
      params.append('desde', opciones.desde)
    }
    return httpClient.get<ExecutionResponse<ICuotaPlan[]>>(
      `${schema}/PlanCuotas?${params.toString()}`,
    )
  },

  /**
   * Las opciones de cuota para un monto: mínima, la sugerida a partir de lo
   * que el socio escribió, y máxima.
   *
   * `cuotaPedida` es opcional: sin ella vuelven solo la mínima y la máxima.
   *
   * Cada opción la calcula la misma función que usa el servidor al guardar la
   * solicitud, así que la que el socio elija es la que se le va a cobrar.
   */
  getOpcionesCuota: (
    monto: number,
    cuotaPedida?: number | null,
    /**
     * La solicitud que se está EDITANDO, si se está editando una.
     *
     * Sin esto, abrir una Pendiente para cambiarla devuelve el bloqueo "ya
     * tiene una solicitud pendiente": se cuenta a sí misma. Es la misma
     * exclusión que hace el servidor al guardar.
     */
    solicitudId?: number | null,
    /**
     * La tasa que está evaluando el APROBADOR.
     *
     * Sin ella el servidor usa la de referencia, que es con la que se cotizó
     * la solicitud. Con ella simula con esa: la tasa definitiva se fija al
     * autorizar, así que el que aprueba tiene que poder ver qué cuota sale con
     * cada una.
     */
    tasaId?: number | null,
    /**
     * Quien pregunta es un FIRMANTE, no el dueño de la solicitud.
     *
     * >>> CAMBIA DE QUIÉN SON LOS NÚMEROS <<<
     * El plan no sale solo del monto: depende del tramo de crédito del socio
     * —que se elige por su empresa y su tipo de planilla— y de los préstamos
     * que ya tiene. Sin esto el servidor usaba el código del que mira, así que
     * el aprobador veía el plan calculado sobre SU propio tramo: el mismo
     * monto y la misma cuota, pero otra cantidad de cuotas que la que pidió el
     * socio.
     *
     * Requiere `solicitudId`, y el servidor comprueba que esa solicitud esté
     * asignada a quien pregunta.
     */
    comoAprobador?: boolean,
  ) => {
    const params = new URLSearchParams({ monto: String(monto) })
    if (cuotaPedida != null && cuotaPedida > 0) {
      params.append('cuotaPedida', String(cuotaPedida))
    }
    if (solicitudId != null && solicitudId > 0) {
      params.append('solicitudId', String(solicitudId))
    }
    if (tasaId != null && tasaId > 0) {
      params.append('tasaId', String(tasaId))
    }
    if (comoAprobador) {
      params.append('comoAprobador', 'true')
    }
    return httpClient.get<ExecutionResponse<IOpcionCuota[]>>(
      `${schema}/OpcionesCuota?${params.toString()}`,
    )
  },

  /**
   * Crea la solicitud de préstamo. Nace en Pendiente; el estado no se manda
   * desde acá, lo fija el servidor.
   *
   * La respuesta trae lo que quedó realmente guardado — el plazo, la cuota
   * cotizada, si terminó siendo un refinanciamiento y cuántas firmas necesita —
   * porque el servidor vuelve a resolver la cuota al guardar y puede no ser
   * idéntica a la que se mostró.
   */
  crearSolicitud: (data: ICrearSolicitud) =>
    httpClient.post<ExecutionResponse<ICrearSolicitudResult | null>, ICrearSolicitud>(
      `${schema}/CrearSolicitudPrestamo`,
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
