import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Input, Spinner, useTheme } from 'tamagui'
import { Search, X, UserCheck, DoorOpen } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import AppDatePicker from '../../components/commons/AppDatePicker'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IAprobador, IEmpleado, IPaseCategoria } from '../../api/modules/pases/pases.types'

export default function PaseCrearScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const theme = useTheme()

  const [categorias, setCategorias] = useState<IPaseCategoria[]>([])
  const [aprobadores, setAprobadores] = useState<IAprobador[]>([])

  // Búsqueda de empleado
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<IEmpleado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [empleado, setEmpleado] = useState<IEmpleado | null>(null)
  const debounceRef = useRef<any>(null)

  // Formulario
  const [categoriaId, setCategoriaId] = useState<number | undefined>(undefined)
  const [fecha, setFecha] = useState<string | null>(null)
  const [aprobadorUser, setAprobadorUser] = useState<string | undefined>(undefined)
  const [observacion, setObservacion] = useState('')
  const [saving, setSaving] = useState(false)

  usePasesHeader('Crear pase')

  useEffect(() => {
    ;(async () => {
      try {
        const [cat, apr] = await Promise.all([
          pasesService.getCategorias(true),
          pasesService.getAprobadores(''),
        ])
        if (cat.Success) setCategorias(cat.Data ?? [])
        if (apr.Success) setAprobadores(apr.Data ?? [])
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
      }
    })()
  }, [])

  // Búsqueda de empleados (debounce)
  const onChangeQuery = (text: string) => {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!text.trim() || !user?.Code) {
      setResultados([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const resp = await pasesService.buscarEmpleados(user.Code, text.trim())
        if (resp.Success) setResultados(resp.Data ?? [])
        else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo buscar', 4000, 'bottom')
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
      }
      setBuscando(false)
    }, 400)
  }

  const seleccionarEmpleado = (e: IEmpleado) => {
    setEmpleado(e)
    setResultados([])
    setQuery('')
    // Preseleccionar al jefe inmediato si está entre los aprobadores
    if (e.JefeCode) {
      const jefe = aprobadores.find((a) => a.ExternalCode && a.ExternalCode === e.JefeCode)
      if (jefe) setAprobadorUser(jefe.User_Code)
    }
  }

  const aprobadorNombre = aprobadores.find((a) => a.User_Code === aprobadorUser)?.Nombre

  const crear = async () => {
    if (!empleado) return showToast('error', 'Validación', 'Selecciona al empleado del pase', 4000, 'bottom')
    if (!categoriaId) return showToast('error', 'Validación', 'Selecciona la categoría', 4000, 'bottom')
    if (!fecha) return showToast('error', 'Validación', 'Selecciona la fecha del pase', 4000, 'bottom')
    if (!aprobadorUser) return showToast('error', 'Validación', 'Selecciona quién aprobará', 4000, 'bottom')

    setSaving(true)
    try {
      const resp = await pasesService.crear({
        EmpleadoCode: empleado.EmpleadoCode,
        Categoria_Id: categoriaId,
        FechaPase: fecha,
        Observacion: observacion.trim() || null,
        Create_By: user!.Code,
        AprobadorUser: aprobadorUser,
        AprobadorNombre: aprobadorNombre,
      })
      if (resp.Success) {
        showToast('success', 'Éxito', resp.SuccessMessage || 'Pase creado', 4000, 'bottom')
        // Reset
        setEmpleado(null)
        setCategoriaId(undefined)
        setFecha(null)
        setAprobadorUser(undefined)
        setObservacion('')
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo crear el pase', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setSaving(false)
  }

  const categoriaOptions = categorias.map((c) => ({
    label: `${c.Name} (${c.Tipo === 'E' ? 'Entrada' : 'Salida'})`,
    value: c.Id!,
  }))
  const aprobadorOptions = aprobadores.map((a) => ({ label: a.Nombre, value: a.User_Code }))

  return (
    <Page>
      <ScrollView flex={1} backgroundColor="$backgroundPage" keyboardShouldPersistTaps="handled">
        <YStack padding="$4" gap="$3">

          {/* Empleado del pase */}
          {empleado ? (
            <XStack
              backgroundColor="$backgroundElevated"
              borderRadius="$4"
              padding="$3"
              alignItems="center"
              gap="$3"
              borderWidth={1}
              borderColor="$primary"
            >
              <View
                width={38}
                height={38}
                borderRadius={19}
                backgroundColor="rgba(255,85,26,0.12)"
                justifyContent="center"
                alignItems="center"
              >
                <UserCheck size={18} color="#FF551A" />
              </View>
              <YStack flex={1}>
                <Text fontWeight="700" fontSize={14} color="$text">{empleado.EmpleadoNombre}</Text>
                <Text fontSize={12} color="$textMuted">
                  {empleado.EmpleadoCode}{empleado.Departamento ? ` · ${empleado.Departamento}` : ''}
                </Text>
              </YStack>
              <View onPress={() => setEmpleado(null)} pressStyle={{ opacity: 0.6 }} padding="$2">
                <X size={18} color={theme.textMuted?.val as string} />
              </View>
            </XStack>
          ) : (
            <YStack gap="$2">
              <Text fontSize={12} fontWeight="600" color="$textMuted">Empleado del pase</Text>
              <XStack
                backgroundColor="$backgroundElevated"
                borderRadius="$3"
                paddingHorizontal="$3"
                alignItems="center"
                gap="$2"
                borderWidth={1}
                borderColor="$border"
                height={44}
              >
                <Search size={16} color={theme.textMuted?.val as string} />
                <Input
                  flex={1}
                  value={query}
                  onChangeText={onChangeQuery}
                  placeholder="Buscar por nombre o código…"
                  placeholderTextColor={theme.textMuted?.val as string}
                  borderWidth={0}
                  backgroundColor="transparent"
                  fontSize={13}
                  color="$text"
                  padding={0}
                />
                {buscando && <Spinner size="small" color="$primary" />}
              </XStack>

              {resultados.map((e) => (
                <View
                  key={e.EmpleadoCode}
                  onPress={() => seleccionarEmpleado(e)}
                  pressStyle={{ opacity: 0.6 }}
                  backgroundColor="$backgroundElevated"
                  borderRadius="$3"
                  paddingVertical="$2.5"
                  paddingHorizontal="$3"
                  borderWidth={1}
                  borderColor="$border"
                >
                  <Text fontWeight="600" fontSize={13} color="$text">{e.EmpleadoNombre}</Text>
                  <Text fontSize={11} color="$textMuted">
                    {e.EmpleadoCode}{e.Departamento ? ` · ${e.Departamento}` : ''}
                  </Text>
                </View>
              ))}
            </YStack>
          )}

          {/* Categoría */}
          <AppSelect
            label="Categoría"
            value={categoriaId}
            onValueChange={(v) => setCategoriaId(Number(v))}
            options={categoriaOptions}
          />

          {/* Fecha */}
          <AppDatePicker
            label="Fecha del pase"
            mode="single"
            direction="future"
            value={fecha}
            onChange={setFecha}
          />

          {/* Aprobador */}
          <AppSelect
            label="Aprobador"
            value={aprobadorUser}
            onValueChange={(v) => setAprobadorUser(String(v))}
            options={aprobadorOptions}
          />

          {/* Observación */}
          <AppInput label="Observación (opcional)" value={observacion} onChangeText={setObservacion} />

          <Button
            height={48}
            backgroundColor="$primary"
            borderRadius="$4"
            pressStyle={{ opacity: 0.7 }}
            onPress={crear}
            disabled={saving}
            opacity={saving ? 0.6 : 1}
            marginTop="$2"
            icon={saving ? <Spinner color="white" /> : <DoorOpen size={18} color="white" />}
          >
            <Text color="white" fontWeight="700">Crear pase</Text>
          </Button>

        </YStack>
      </ScrollView>
    </Page>
  )
}
