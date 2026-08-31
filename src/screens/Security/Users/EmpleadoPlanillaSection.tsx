import React, { useCallback, useEffect, useState } from 'react'
import { YStack, XStack, Text, View, Spinner, Button } from 'tamagui'
import { Search, UserCheck, AlertCircle, AlertTriangle, Building2, IdCard, Briefcase, UserPlus } from 'lucide-react-native'
import AppInput from '../../../components/commons/AppInput'
import FormDialog from '../../../components/commons/FormDialog'
import { empleadoPlanillaService } from '../../../api/modules/empleadoPlanilla/empleadoPlanilla.service'
import { IEmpleadoPlanilla, IEmpleadoVinculado } from '../../../api/modules/empleadoPlanilla/empleadoPlanilla.types'
import { handleError } from '../../../utils/errorHandler'
import { useShowToast } from '../../../utils/useShowToast'
import { shadows } from '../../../theme/shadows'

/**
 * Sección "Empleado de planilla" del formulario de usuarios.
 *
 * Amarra el usuario con su empleado: se elige de una lista que viene de
 * planilla y se guardan sus dos códigos (personal y alterno). Es lo que
 * permite que los permisos personales sepan qué empleado es cada usuario, y
 * lo que va a permitir leer el carnet en portería.
 *
 * Antes esto se hacía tecleando el código a mano en el diálogo de "código
 * externo" del listado, sin lista y sin validación. En producción hay usuarios
 * con códigos que no son de nadie por ese camino.
 *
 * La búsqueda vive en un DIÁLOGO y no dentro del formulario: son hasta 50
 * empleados, y desplegados ahí mismo empujan el resto de los campos tan abajo
 * que el formulario deja de verse. Acá la sección ocupa siempre una línea o una
 * tarjeta.
 *
 * Al abrir un usuario ya vinculado se muestra el empleado **resuelto contra
 * planilla**, no el código guardado. Esa es la parte que hace visible un
 * vínculo equivocado: el usuario se llama de una forma y el empleado de abajo
 * es otra persona.
 *
 * Nada se aplica al tocar: elegir o quitar deja una acción PENDIENTE que el
 * formulario ejecuta al guardar, después de guardar al usuario. Se hace así
 * porque el Code del usuario puede cambiar en el mismo guardado, y porque
 * cancelar el formulario tiene que cancelarlo todo.
 */

/** Lo que va a pasar con el vínculo cuando se guarde el formulario. */
export type AccionEmpleado =
  | { tipo: 'vincular'; empleado: IEmpleadoPlanilla }
  | { tipo: 'quitar' }
  | null

type Props = {
  /** Code del usuario que se edita. Vacío en un alta. */
  userCode?: string
  accion: AccionEmpleado
  onAccion: (accion: AccionEmpleado) => void
  /** Se llama al elegir un empleado, para llenar los campos que estén vacíos. */
  onElegir?: (empleado: IEmpleadoPlanilla) => void
}

/** Palabras que no se capitalizan en medio de un nombre: "Asesor de Negocios". */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'a'])

/** Capitaliza "LAURA KARINA" -> "Laura Karina". Planilla lo guarda en mayúsculas. */
const capitalizar = (texto: string | null | undefined): string =>
  (texto ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')

/**
 * Planilla antepone el código a casi todo: "003483 - LAURA CHINCHILLA",
 * "IT0103 - DESARROLLO", "437 - ASESOR DE NEGOCIOS". El código ya se muestra
 * aparte cuando hace falta, y capitalizarlo lo estropea ("It0103"), así que se
 * recorta y se capitaliza solo la descripción.
 */
const sinCodigo = (texto: string | null | undefined): string => {
  const limpio = (texto ?? '').trim()
  const guion = limpio.indexOf(' - ')
  return capitalizar(guion >= 0 ? limpio.slice(guion + 3) : limpio)
}

/** Alias con nombre propio: para el nombre de la persona se lee mejor así. */
const soloNombre = sinCodigo

const Tarjeta = ({ children }: { children: React.ReactNode }) => (
  <YStack
    gap="$2.5"
    padding="$3.5"
    backgroundColor="$backgroundElevated"
    borderRadius="$4"
    borderWidth={1}
    borderColor="$border"
    {...shadows.sm}
  >
    {children}
  </YStack>
)

const Enlace = ({ texto, onPress, color = '$primary' }: { texto: string; onPress: () => void; color?: string }) => (
  <Text fontSize={12} color={color} fontWeight="600" pressStyle={{ opacity: 0.6 }} onPress={onPress}>
    {texto}
  </Text>
)

export default function EmpleadoPlanillaSection({ userCode, accion, onAccion, onElegir }: Props) {
  const { showToast } = useShowToast()

  const [vinculado, setVinculado] = useState<IEmpleadoVinculado | null>(null)
  const [cargando, setCargando] = useState(false)

  const [dialogo, setDialogo] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [empleados, setEmpleados] = useState<IEmpleadoPlanilla[]>([])
  const [buscando, setBuscando] = useState(false)

  // ── Vínculo actual ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userCode) return

    let vigente = true
    setCargando(true)

    empleadoPlanillaService
      .vinculado(userCode)
      .then(res => {
        if (!vigente) return
        if (res?.Success) setVinculado(res.Data ?? null)
      })
      .catch(() => {
        // Sin esto la sección igual sirve para vincular; no vale la pena
        // interrumpir la edición del usuario con un error.
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => { vigente = false }
  }, [userCode])

  // ── Buscador ──────────────────────────────────────────────────────────
  const buscar = useCallback(async (texto: string) => {
    setBuscando(true)
    try {
      const response = await empleadoPlanillaService.buscar(texto, userCode)

      if (response?.Success && response.Data) {
        setEmpleados(response.Data)
      } else {
        setEmpleados([])
        if (response?.ErrorMessage) {
          showToast('error', 'Error', response.ErrorMessage, 5000, 'top')
        }
      }
    } catch (err) {
      setEmpleados([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setBuscando(false)
    }
    // showToast queda fuera: cambia de identidad en cada render y dispararía
    // la búsqueda en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCode])

  // Búsqueda con retardo: la lista sale de planilla, y consultar en cada tecla
  // haría una llamada por letra. Con el diálogo cerrado no se consulta nada.
  useEffect(() => {
    if (!dialogo) return

    const t = setTimeout(() => buscar(filtro), 400)
    return () => clearTimeout(t)
  }, [filtro, dialogo, buscar])

  const abrirDialogo = () => {
    setFiltro('')
    setEmpleados([])
    setDialogo(true)
  }

  const elegir = (empleado: IEmpleadoPlanilla) => {
    if (!empleado.Disponible) {
      showToast(
        'error',
        'Empleado ya vinculado',
        `${soloNombre(empleado.Employees_Name)} ya está vinculado al usuario ${empleado.UsuarioAsignado ?? ''}.`.trim(),
        6000,
        'top',
      )
      return
    }

    onAccion({ tipo: 'vincular', empleado })
    onElegir?.(empleado)
    setDialogo(false)
  }

  // El empleado resuelto: puede faltar porque el código no existe en planilla,
  // o porque varias personas lo comparten y el alterno guardado no es de
  // ninguna. Son dos problemas distintos y se dicen distinto.
  const resuelto = vinculado?.Empleado
  const ambiguo = !resuelto && (vinculado?.CoincidenciasEnPlanilla ?? 0) > 1
  const yaTieneVinculo = !!vinculado?.EmployeeCode

  // Alterno guardado sin código de personal. Es medio vínculo y no sirve para
  // nada: los permisos personales resuelven por el código de personal, así que
  // el usuario queda igual de desvinculado, pero con un alterno ocupado que
  // puede ser el de otra persona. Sin decirlo, esto se ve idéntico a "no tiene
  // nada" y nadie lo corrige.
  const alternoHuerfano = !yaTieneVinculo && !!vinculado?.CodAlterno

  /** El cuerpo de la sección, que es siempre una línea o una tarjeta. */
  const contenido = () => {
    // Elegido en esta edición, pendiente de guardar.
    if (accion?.tipo === 'vincular') {
      const emp = accion.empleado

      return (
        <Tarjeta>
          <XStack alignItems="center" gap="$2.5">
            <UserCheck size={18} color="#22C55E" />
            <YStack flex={1}>
              <Text fontSize={14} fontWeight="700" color="$text">
                {soloNombre(emp.Employees_Name)}
              </Text>
              <Text fontSize={11} color="$textMuted">
                Código {emp.Employees_Code}
                {emp.Cod_Alterno ? ` · Alterno ${emp.Cod_Alterno}` : ' · sin alterno'}
              </Text>
            </YStack>
          </XStack>

          {!!emp.Posicion && (
            <XStack alignItems="center" gap="$2">
              <Briefcase size={14} color="#94A3B8" />
              <Text fontSize={12} color="$textMuted" flex={1}>{sinCodigo(emp.Posicion)}</Text>
            </XStack>
          )}

          <Text fontSize={11} color="$textMuted">Se vincula al guardar.</Text>

          <XStack gap="$4">
            <Enlace texto="Cambiar" onPress={abrirDialogo} />
            <Enlace texto="Deshacer" color="$textSecondary" onPress={() => onAccion(null)} />
          </XStack>
        </Tarjeta>
      )
    }

    // Marcado para quitar.
    if (accion?.tipo === 'quitar') {
      return (
        <Tarjeta>
          <XStack alignItems="flex-start" gap="$2.5">
            <View marginTop={2}><AlertTriangle size={16} color="#F59E0B" /></View>
            <Text fontSize={12} color="$text" flex={1}>
              Se va a quitar el vínculo al guardar. El usuario dejará de poder solicitar
              permisos personales hasta que se le vincule un empleado.
            </Text>
          </XStack>
          <Enlace texto="Deshacer" onPress={() => onAccion(null)} />
        </Tarjeta>
      )
    }

    if (cargando) {
      return (
        <XStack alignItems="center" gap="$2" paddingVertical="$2" paddingHorizontal="$1">
          <Spinner size="small" color="$primary" />
          <Text fontSize={13} color="$textMuted">Cargando...</Text>
        </XStack>
      )
    }

    // Sin vínculo: una sola línea, para no ocupar el formulario con algo que
    // muchos usuarios no van a llenar.
    if (!yaTieneVinculo) {
      return (
        <YStack gap="$2">
          {alternoHuerfano && (
            <XStack
              alignItems="flex-start"
              gap="$2"
              padding="$3"
              backgroundColor="$backgroundElevated"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$border"
            >
              <View marginTop={2}><AlertTriangle size={14} color="#F59E0B" /></View>
              <Text fontSize={11} color="$textMuted" flex={1}>
                Este usuario tiene guardado el código alterno {vinculado?.CodAlterno} pero
                ningún código de personal, así que sigue sin poder solicitar permisos
                personales. Elegí al empleado para dejarlo completo.
              </Text>
            </XStack>
          )}

          <Button
            height={46}
            borderRadius={12}
            backgroundColor="$backgroundElevated"
            borderWidth={1}
            borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            justifyContent="flex-start"
            icon={<UserPlus size={16} color="#94A3B8" />}
            onPress={abrirDialogo}
          >
            <Text fontSize={13} color="$textMuted">Elegir empleado de planilla</Text>
          </Button>
        </YStack>
      )
    }

    // Vínculo actual.
    return (
      <Tarjeta>
        <XStack alignItems="center" gap="$2.5">
          {/* El ícono dice de un vistazo si el vínculo sirve. Verde solo cuando
              de verdad está bien: con un código que no existe, un check verde
              diría lo contrario de lo que dice el texto. */}
          {!resuelto ? (
            <AlertCircle size={18} color="#EF4444" />
          ) : !vinculado?.AlternoCoincide ? (
            <AlertTriangle size={18} color="#F59E0B" />
          ) : (
            <UserCheck size={18} color="#22C55E" />
          )}
          <YStack flex={1}>
            <Text fontSize={14} fontWeight="700" color="$text">
              {resuelto
                ? soloNombre(resuelto.Employees_Name)
                : ambiguo
                  ? 'Empleado sin identificar'
                  : 'Empleado desconocido'}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Código {vinculado?.EmployeeCode}
              {vinculado?.CodAlterno ? ` · Alterno ${vinculado.CodAlterno}` : ' · sin alterno'}
            </Text>
          </YStack>
        </XStack>

        {!!resuelto?.Centro_Costos && (
          <XStack alignItems="center" gap="$2">
            <Building2 size={14} color="#94A3B8" />
            <Text fontSize={12} color="$textMuted" flex={1}>{sinCodigo(resuelto.Centro_Costos)}</Text>
          </XStack>
        )}

        {/* El código guardado no es de nadie en planilla. */}
        {!vinculado?.ExisteEnPlanilla && (
          <XStack alignItems="flex-start" gap="$2">
            <View marginTop={2}><AlertCircle size={14} color="#EF4444" /></View>
            <Text fontSize={11} color="$error" flex={1}>
              Planilla no tiene ningún empleado con ese código. Elegí al empleado correcto.
            </Text>
          </XStack>
        )}

        {/* Varias personas con ese código y ninguna con el alterno guardado.
            Pasa porque planilla numera por empresa. Sin el alterno correcto el
            vínculo no identifica a nadie. */}
        {ambiguo && (
          <XStack alignItems="flex-start" gap="$2">
            <View marginTop={2}><AlertCircle size={14} color="#EF4444" /></View>
            <Text fontSize={11} color="$error" flex={1}>
              Hay {vinculado?.CoincidenciasEnPlanilla} empleados con el código{' '}
              {vinculado?.EmployeeCode} en distintas empresas y el alterno guardado no es de
              ninguno, así que no se sabe quién es. Elegí al empleado correcto.
            </Text>
          </XStack>
        )}

        {/* El alterno guardado no es el que planilla le da a ese empleado: es
            justo el que se lee del carnet, así que no coincidir lo rompe. */}
        {!!resuelto && !vinculado?.AlternoCoincide && (
          <XStack alignItems="flex-start" gap="$2">
            <View marginTop={2}><AlertTriangle size={14} color="#F59E0B" /></View>
            <Text fontSize={11} color="$textMuted" flex={1}>
              El alterno guardado no es el de planilla
              {resuelto?.Cod_Alterno ? ` (${resuelto.Cod_Alterno})` : ''}.
              Volvé a elegir al empleado para corregirlo.
            </Text>
          </XStack>
        )}

        <XStack gap="$4">
          <Enlace texto="Cambiar empleado" onPress={abrirDialogo} />
          <Enlace texto="Quitar" color="$error" onPress={() => onAccion({ tipo: 'quitar' })} />
        </XStack>
      </Tarjeta>
    )
  }

  return (
    <YStack gap="$2" marginTop="$3">
      <XStack alignItems="center" gap="$2" paddingHorizontal="$1">
        <IdCard size={14} color="#94A3B8" />
        <Text fontSize={13} fontWeight="700" color="$text">Empleado de planilla</Text>
      </XStack>

      {contenido()}

      <FormDialog
        open={dialogo}
        onOpenChange={setDialogo}
        // Sin tope, la lista de 50 empleados estira el diálogo de borde a
        // borde y el botón de cerrar queda fuera de la pantalla.
        maxHeight={560}
        title="Elegir empleado"
        description="Se guardan su código de personal y su alterno."
        footer={
          <XStack marginTop="$3">
            <Button
              flex={1}
              height={45}
              borderRadius="$3"
              backgroundColor="$buttonSecondary"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => setDialogo(false)}
            >
              <Text color="$text" fontWeight="700">Cerrar</Text>
            </Button>
          </XStack>
        }
      >
        <YStack gap="$2">
          <AppInput
            label="Buscar"
            value={filtro}
            onChangeText={setFiltro}
            placeholder="Código o nombre"
            autoCapitalize="none"
            autoCorrect={false}
            prefix={<Search size={16} color="#94A3B8" />}
          />

          {buscando && (
            <XStack alignItems="center" gap="$2" paddingVertical="$2">
              <Spinner size="small" color="$primary" />
              <Text fontSize={13} color="$textMuted">Buscando...</Text>
            </XStack>
          )}

          {!buscando && empleados.length === 0 && (
            <Text fontSize={12} color="$textMuted" paddingVertical="$2">
              No hay empleados que coincidan. Probá con el código de personal, o con
              palabras seguidas del nombre.
            </Text>
          )}

          {empleados.map(emp => (
            <XStack
              // El código de personal NO alcanza como llave: se repite entre
              // empresas, y una búsqueda por "000005" trae cinco personas.
              key={`${emp.Employees_Code ?? ''}-${emp.Company_Code ?? ''}-${emp.Cod_Alterno ?? ''}`}
              alignItems="center"
              gap="$3"
              padding="$3"
              backgroundColor="$backgroundElevated"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$border"
              pressStyle={{ opacity: 0.6 }}
              // Los tomados NO se esconden: se muestran apagados y al tocarlos
              // explican por qué no se pueden usar. Desaparecer sin explicación
              // deja a quien busca creyendo que el empleado no existe.
              opacity={emp.Disponible ? 1 : 0.55}
              onPress={() => elegir(emp)}
            >
              <YStack flex={1} gap="$1">
                <Text fontSize={14} fontWeight="600" color="$text">
                  {soloNombre(emp.Employees_Name)}
                </Text>
                <Text fontSize={11} color="$textMuted">
                  {emp.Employees_Code}
                  {emp.Cod_Alterno ? ` · Alterno ${emp.Cod_Alterno}` : ''}
                </Text>

                {!emp.Disponible && (
                  <XStack alignItems="center" gap="$1.5" marginTop="$1">
                    <AlertCircle size={12} color="#EF4444" />
                    <Text fontSize={11} color="$error">
                      Ya vinculado{emp.UsuarioAsignado ? ` a ${emp.UsuarioAsignado}` : ''}
                    </Text>
                  </XStack>
                )}
              </YStack>
            </XStack>
          ))}
        </YStack>
      </FormDialog>
    </YStack>
  )
}
