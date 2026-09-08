import React, { useState } from 'react'
import { YStack, XStack, Text, View } from 'tamagui'
import { ChevronDown, Wallet, PiggyBank, Landmark } from 'lucide-react-native'
import { IEstadoCuenta } from '../../api/modules/cooperativa/cooperativa.types'
import { shadows } from '../../theme/shadows'

/**
 * Estado de cuenta del socio, plegable.
 *
 * Lo usan el perfil y el formulario de nueva solicitud. Vive acá y no en una
 * de las dos pantallas porque son los mismos números leídos con la misma
 * intención: cuánto tengo y cuánto debo.
 *
 * El saldo neto se ve SIN abrir. Es el número que decide, y obligar a un toque
 * para verlo no aporta nada.
 */

/** Monto en lempiras. Cooperativa maneja HNL. */
const fmtMoneda = (valor: number | null | undefined): string => {
  if (valor === null || valor === undefined) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function EstadoCuentaCard({
  datos,
  /**
   * Si arranca abierto. En el perfil sí: ahí el estado de cuenta es a lo que se
   * viene. En el formulario no: ahí es contexto para elegir el monto.
   */
  inicialAbierto = false,
}: {
  datos: IEstadoCuenta
  inicialAbierto?: boolean
}) {
  const [abierto, setAbierto] = useState(inicialAbierto)

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$border"
      overflow="hidden"
      {...shadows.sm}
    >
      <XStack
        alignItems="center"
        gap="$2.5"
        padding="$3.5"
        pressStyle={{ opacity: 0.6 }}
        onPress={() => setAbierto(v => !v)}
      >
        <Wallet size={18} color="#94A3B8" />

        <YStack flex={1} gap="$1">
          <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
            ESTADO DE CUENTA
          </Text>
          <Text fontSize={17} fontWeight="700" color={datos.SaldoNeto < 0 ? '$error' : '$text'}>
            {fmtMoneda(datos.SaldoNeto)}
          </Text>
        </YStack>

        <View rotate={abierto ? '180deg' : '0deg'}>
          <ChevronDown size={18} color="#94A3B8" />
        </View>
      </XStack>

      {abierto && (
        <YStack
          gap="$3"
          paddingHorizontal="$3.5"
          paddingBottom="$3.5"
          paddingTop="$2"
          borderTopWidth={1}
          borderTopColor="$border"
        >
          {!!datos.NombreCompleto && (
            <YStack gap="$1">
              <Text fontSize={13} fontWeight="600" color="$text">
                {datos.NombreCompleto.replace(/\s+/g, ' ').trim()}
              </Text>
              <Text fontSize={11} color="$textMuted">
                Socio {datos.Codigo}
              </Text>
            </YStack>
          )}

          {/* Tres columnas: concepto, CUOTA y saldo.
              La cuota va en medio porque responde otra pregunta: el saldo dice
              cuánto lleva o cuánto debe, la cuota dice cuánto le sale de cada
              pago de planilla. */}
          <XStack alignItems="center" gap="$2">
            <View width={16} />
            <View flex={1} />
            <Text fontSize={10} color="$textMuted" width={82} textAlign="right">
              CUOTA
            </Text>
            <Text fontSize={10} color="$textMuted" width={96} textAlign="right">
              SALDO
            </Text>
          </XStack>

          {/* Ahorros, a favor */}
          <XStack alignItems="center" gap="$2">
            <PiggyBank size={16} color="#22C55E" />
            <YStack flex={1}>
              <Text fontSize={13} color="$text">Ahorros</Text>
              <Text fontSize={11} color="$textMuted">
                {datos.TotalCuentas} {datos.TotalCuentas === 1 ? 'cuenta' : 'cuentas'}
              </Text>
            </YStack>
            <Text fontSize={13} color="$text" width={82} textAlign="right">
              {fmtMoneda(datos.CuotaAhorro)}
            </Text>
            <Text fontSize={14} fontWeight="700" color="$success" width={96} textAlign="right">
              {fmtMoneda(datos.SaldoCuentas)}
            </Text>
          </XStack>

          {/* Deuda, en contra. Se antepone el signo para que la resta del saldo
              neto se lea sola. */}
          <XStack alignItems="center" gap="$2">
            <Landmark size={16} color="#EF4444" />
            <YStack flex={1}>
              <Text fontSize={13} color="$text">Préstamos</Text>
              <Text fontSize={11} color="$textMuted">
                {datos.TotalPrestamos} {datos.TotalPrestamos === 1 ? 'préstamo' : 'préstamos'}
              </Text>
            </YStack>
            <Text fontSize={13} color="$text" width={82} textAlign="right">
              {fmtMoneda(datos.CuotaPrestamo)}
            </Text>
            <Text fontSize={14} fontWeight="700" color="$error" width={96} textAlign="right">
              {datos.SaldoPrestamos > 0 ? '-' : ''}{fmtMoneda(datos.SaldoPrestamos)}
            </Text>
          </XStack>

          <XStack
            alignItems="center"
            gap="$2"
            paddingTop="$2.5"
            borderTopWidth={1}
            borderTopColor="$border"
          >
            <Text fontSize={13} fontWeight="600" color="$text" flex={1}>
              Saldo neto
            </Text>
            {/* Debajo de la columna de cuotas, su total: lo que se le va de
                cada pago entre ahorro y préstamos. */}
            <Text fontSize={13} fontWeight="700" color="$text" width={82} textAlign="right">
              {fmtMoneda((datos.CuotaAhorro ?? 0) + (datos.CuotaPrestamo ?? 0))}
            </Text>
            <Text
              fontSize={16}
              fontWeight="700"
              color={datos.SaldoNeto < 0 ? '$error' : '$success'}
              width={96}
              textAlign="right"
            >
              {fmtMoneda(datos.SaldoNeto)}
            </Text>
          </XStack>
        </YStack>
      )}
    </YStack>
  )
}
