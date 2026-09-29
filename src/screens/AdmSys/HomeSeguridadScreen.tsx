import React from 'react'
import { ScrollView, RefreshControl } from 'react-native'
import { YStack, XStack, Text, View, useTheme } from 'tamagui'
import { useNavigation } from '@react-navigation/native'
import {
  ScanLine, ShieldCheck, UserCheck, PackageCheck,
  Users, ClipboardList, Boxes,
} from 'lucide-react-native'

import { useMenu } from '../../context/MenuContext'
import { useAuth } from '../../context/AuthContext'
import { SkeletonBox } from '../../components/Skeletons/SkeletonList'
import CardSaludo from './CardSaludo'

/**
 * El inicio de quien trabaja en seguridad.
 *
 * ── LA JERARQUÍA ES EL DISEÑO ──────────────────────────────────────────────
 * Escanear es lo único que se hace con una persona esperando enfrente, así que
 * esas tres opciones tienen que encontrarse sin leer: tarjetas grandes, ícono
 * sólido en color y una etiqueta que dice ESCANEAR. Los tableros se consultan
 * entre medio, sin apuro, y por eso son una lista discreta — presentes, pero
 * incapaces de competir por el pulgar.
 *
 * Antes las dos secciones usaban la misma tarjeta y quedaban seis bloques
 * iguales: para elegir había que leerlos.
 *
 * ── POR QUÉ TRES MÓDULOS Y NO UNO ──────────────────────────────────────────
 * Por una puerta entra una persona de visita, por otra sale un empleado, por
 * otra sale material. Los nombres se parecen mucho; lo que cruza la puerta, no.
 * Por eso cada tarjeta dice QUÉ se escucha ahí antes que cómo se llama la
 * pantalla.
 *
 * ── SOLO LO QUE EL USUARIO TIENE ───────────────────────────────────────────
 * Cada opción aparece si el menú del usuario trae esa ruta. Se lee del mismo
 * menú que dibuja el cajón lateral, así que no pueden discrepar.
 *
 * ── QUIÉN VE ESTA PANTALLA ─────────────────────────────────────────────────
 * Quien tenga el acceso `HomeSeguridad`. Quien no, sigue con el inicio de
 * siempre: este acceso agrega un camino, no quita el que había.
 */

type Destino = {
  ruta: string
  titulo: string
  que: string
  icono: typeof UserCheck
}

/** Lo que se hace con alguien enfrente. Es lo que manda en esta pantalla. */
const ESCANEOS: Destino[] = [
  {
    ruta: 'visitasValidar',
    titulo: 'Visitas',
    que: 'Entra una persona de visita',
    icono: UserCheck,
  },
  {
    ruta: 'paseValidar',
    titulo: 'Permisos personales',
    que: 'Sale un empleado en horario laboral',
    icono: ScanLine,
  },
  {
    ruta: 'pasesSalidaEscanear',
    titulo: 'Pases de salida',
    que: 'Sale o regresa material',
    icono: PackageCheck,
  },
]

/**
 * Lo que se consulta cuando no hay nadie en la fila.
 *
 * Los textos son más cortos que los de escaneo porque van en tres columnas de
 * un teléfono: entran unas 14 letras por renglón. El nombre identifica el
 * módulo y la línea de abajo dice qué pregunta contesta.
 */
const TABLEROS: Destino[] = [
  {
    ruta: 'visitasDashboard',
    titulo: 'Visitas',
    que: 'Quién está adentro',
    icono: Users,
  },
  {
    ruta: 'paseTablero',
    titulo: 'Permisos',
    que: 'Quién salió hoy',
    icono: ClipboardList,
  },
  {
    ruta: 'pasesSalidaControlSalida',
    titulo: 'Materiales',
    que: 'Qué está afuera',
    icono: Boxes,
  },
]

/**
 * La opción de escaneo: una fila compacta.
 *
 * Es del alto de un renglón doble, no de una tarjeta. Lo que la hace principal
 * no es el tamaño sino el COLOR: fondo teñido, borde en color y el ícono en un
 * cuadro sólido. Los tableros de abajo son gris sobre blanco, así que la
 * diferencia se ve antes de leer nada y sin gastar media pantalla.
 *
 * Definida FUERA del componente: adentro, React la trataría como un tipo nuevo
 * en cada render y desmontaría la lista entera cada vez.
 */
function FilaEscaneo({ d, onPress }: { d: Destino; onPress: () => void }) {
  const theme = useTheme()
  const Icono = d.icono
  return (
    <XStack
      onPress={onPress}
      /* Al presionar se oscurece el tinte. Sin opacidad: sobre un fondo de color
         la opacidad lo lava y parece deshabilitado. */
      pressStyle={{ backgroundColor: '$primaryOpacity' }}
      backgroundColor="$primaryOpacity2"
      borderWidth={1} borderColor="$primary" borderRadius="$4"
      paddingHorizontal="$3" paddingVertical="$2.5"
      alignItems="center" gap="$3"
    >
      <View
        width={38} height={38} borderRadius="$3"
        backgroundColor="$primary"
        alignItems="center" justifyContent="center"
      >
        <Icono size={19} color="#fff" />
      </View>

      <YStack flex={1} gap={1}>
        <Text fontSize={15} fontWeight="900" color="$text">{d.titulo}</Text>
        {/* La línea que de verdad los distingue: qué cruza la puerta. Los tres
            nombres se parecen; esto no. */}
        <Text fontSize={11.5} fontWeight="700" color="$primary">{d.que}</Text>
      </YStack>

      <ScanLine size={19} color={theme.primary?.val} />
    </XStack>
  )
}

/**
 * El tablero, como columna dentro de una fila de tres.
 *
 * Horizontal y no apilado para que la sección se lea distinta de la de arriba:
 * bloques anchos y de color arriba, tres columnas angostas y grises abajo. La
 * forma sola ya dice que son dos cosas distintas.
 *
 * `flex={1}` con `flexBasis={0}`: las tres quedan del mismo ancho aunque los
 * textos midan distinto. Sin el basis en cero, el nombre más largo se lleva más
 * espacio y las columnas salen desparejas.
 */
function TarjetaTablero({ d, onPress }: { d: Destino; onPress: () => void }) {
  const theme = useTheme()
  const Icono = d.icono
  return (
    <YStack
      onPress={onPress}
      pressStyle={{ backgroundColor: '$primaryOpacity2' }}
      flex={1} flexBasis={0}
      backgroundColor="$backgroundElevated"
      borderWidth={1} borderColor="$border" borderRadius="$4"
      paddingVertical="$3" paddingHorizontal="$2"
      alignItems="center" gap="$1.5"
    >
      <Icono size={22} color={theme.textMuted?.val} />
      {/* numberOfLines: en tres columnas de teléfono entran unas 14 letras por
          renglón, y un texto que se sale rompe la altura de una sola tarjeta y
          desalinea las tres. */}
      <Text fontSize={12.5} fontWeight="800" color="$text"
        textAlign="center" numberOfLines={1}>
        {d.titulo}
      </Text>
      <Text fontSize={10.5} color="$textMuted"
        textAlign="center" numberOfLines={2} lineHeight={14}>
        {d.que}
      </Text>
    </YStack>
  )
}

/**
 * El esqueleto de la primera carga.
 *
 * Copia la FORMA de la pantalla —el saludo, tres filas anchas, tres columnas—
 * y no una lista genérica: así lo que aparece después cae donde el ojo ya lo
 * estaba esperando, en vez de reacomodarse.
 */
function EsqueletoInicio() {
  return (
    <YStack flex={1} padding="$4" backgroundColor="$backgroundPage" gap="$5">
      <SkeletonBox width="100%" height={132} radius={16} />

      <YStack gap="$2.5">
        <SkeletonBox width={90} height={16} />
        {[0, 1, 2].map(i => (
          <XStack key={i} alignItems="center" gap="$3"
            borderWidth={1} borderColor="$border" borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$2.5">
            <SkeletonBox width={38} height={38} radius={10} />
            <YStack flex={1} gap={6}>
              <SkeletonBox width="55%" height={13} />
              <SkeletonBox width="80%" height={10} />
            </YStack>
          </XStack>
        ))}
      </YStack>

      <YStack gap="$2.5">
        <SkeletonBox width={80} height={12} />
        <XStack gap="$2.5">
          {[0, 1, 2].map(i => (
            <YStack key={i} flex={1} flexBasis={0} alignItems="center" gap="$1.5"
              borderWidth={1} borderColor="$border" borderRadius="$4"
              paddingVertical="$3" paddingHorizontal="$2">
              <SkeletonBox width={22} height={22} radius={11} />
              <SkeletonBox width="70%" height={11} />
              <SkeletonBox width="90%" height={9} />
            </YStack>
          ))}
        </XStack>
      </YStack>
    </YStack>
  )
}

export default function HomeSeguridadScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { user } = useAuth()
  /* El menú ES el dato de esta pantalla: de él salen las opciones que se
     muestran. Así que recargar acá es recargar el menú, no otra cosa. */
  const { menu, refreshMenu, loading } = useMenu()
  const [refrescando, setRefrescando] = React.useState(false)

  /* Las rutas que este usuario tiene, en un Set para no recorrer el menú una vez
     por tarjeta. El menú viene plano con los hijos incluidos, así que alcanza
     con mirar Route. */
  const misRutas = React.useMemo(
    () => new Set((menu ?? []).map(m => m?.Route).filter(Boolean) as string[]),
    [menu],
  )

  const escaneos = ESCANEOS.filter(d => misRutas.has(d.ruta))
  const tableros = TABLEROS.filter(d => misRutas.has(d.ruta))

  /* El gesto ya muestra su propio spinner, así que no se toca el loader global:
     dos indicadores a la vez para lo mismo se ve como que algo se trabó. */
  const alDeslizar = React.useCallback(async () => {
    if (!user?.User_Code) return
    setRefrescando(true)
    try { await refreshMenu(user.User_Code) } catch { /* el menú anterior sigue sirviendo */ }
    finally { setRefrescando(false) }
  }, [refreshMenu, user?.User_Code])

  /* El header lo fija HomeScreen, que es quien decide cuál de los dos inicios
     mostrar. Si esta pantalla también lo fijara, los dos se pisarían — y los
     efectos del padre corren DESPUÉS, así que ganaría el otro. */

  /* Solo la primera carga: al deslizar manda el spinner del gesto, y cambiar la
     pantalla por un esqueleto mientras tanto haría parpadear todo. */
  if (loading && !refrescando) return <EsqueletoInicio />

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refrescando}
          onRefresh={alDeslizar}
          colors={[theme.primary?.val ?? '#FF551A']}
          tintColor={theme.primary?.val ?? '#FF551A'}
        />
      }
    >
      <YStack flex={1} padding="$4" backgroundColor="$backgroundPage" gap="$5">

        {/* La misma card del inicio general, con el mensaje que corresponde a
            quien está en un portón y no en un escritorio. */}
        <CardSaludo mensaje="Desde aquí revisa y registra todo lo que entra y sale." />

        {/* ── Lo que manda ── */}
        {escaneos.length > 0 ? (
          <YStack gap="$2.5">
            {/* Un verbo y nada más, igual que CONSULTAR abajo. Cada fila ya dice
                qué se escanea ahí; explicarlo también en el título era repetir
                en el encabezado lo que está tres centímetros más abajo. */}
            <Text fontSize={13} fontWeight="800" color="$textMuted" letterSpacing={0.4}>
              ESCANEAR
            </Text>

            {escaneos.map(d => (
              <FilaEscaneo key={d.ruta} d={d}
                onPress={() => navigation.navigate(d.ruta as never)} />
            ))}
          </YStack>
        ) : null}

        {/* ── Lo secundario ──
             Tres columnas, no una lista apilada: la forma sola ya dice que son
             otra cosa que los bloques anchos de arriba. Y ocupan un tercio del
             alto, que es lo que corresponde a algo que nunca es urgente. */}
        {tableros.length > 0 ? (
          <YStack gap="$2.5">
            <Text fontSize={13} fontWeight="800" color="$textMuted" letterSpacing={0.4}>
              CONSULTAR
            </Text>

            <XStack gap="$2.5" alignItems="stretch">
              {tableros.map(d => (
                <TarjetaTablero key={d.ruta} d={d}
                  onPress={() => navigation.navigate(d.ruta as never)} />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {escaneos.length === 0 && tableros.length === 0 ? (
          /* Sin ninguna ruta no hay nada que ofrecer. Se dice con todas las
             letras: una pantalla en blanco se lee como que la app falló, y acá
             el problema es de permisos. */
          <YStack
            alignItems="center" justifyContent="center" gap="$3"
            paddingVertical="$10" paddingHorizontal="$4"
            borderWidth={1} borderColor="$border" borderStyle="dashed"
            borderRadius="$4" backgroundColor="$backgroundElevated"
          >
            <View
              width={56} height={56} borderRadius={28}
              backgroundColor="$primaryOpacity2"
              alignItems="center" justifyContent="center"
            >
              <ShieldCheck size={26} color={theme.primary?.val} />
            </View>
            <Text fontSize={15} fontWeight="800" color="$text" textAlign="center">
              Todavía no tiene pantallas asignadas
            </Text>
            <Text fontSize={13} color="$textMuted" textAlign="center" maxWidth={300} lineHeight={19}>
              Pida al administrador acceso a los módulos que le corresponden:
              Visitas, Permisos personales o Pases de salida.
            </Text>
          </YStack>
        ) : null}

      </YStack>
    </ScrollView>
  )
}
