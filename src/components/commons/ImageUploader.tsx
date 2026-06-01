import React, { useState } from 'react'
import { Button, YStack, XStack, Image, Text, Card, View } from 'tamagui'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react-native'
import { PermissionsAndroid, Platform } from 'react-native'

type Props = {
  title?: string
  onChange?: (uri: string | null) => void
}

export function ImageUploader({ title = 'Imagen', onChange }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null)

  const pickImage = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      },
      (res) => {
        console.log('IMAGE RESPONSE:', res)
        

        if (res.didCancel || res.errorCode) return

        const asset = res.assets?.[0]
        const uri = asset?.uri
        console.log('URI:', uri)

        if (uri) {
          setImageUri(uri)
        }

        if (uri) {
          setImageUri(uri)
          onChange?.(uri)
        }
      }
    )
  }

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true

    const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Permiso de Cámara',
        message: 'La app necesita acceso a la cámara',
        buttonPositive: 'OK',
      }
    )

    return granted === PermissionsAndroid.RESULTS.GRANTED
  }

  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission()
    if (!hasPermission) return

    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.8,
        cameraType: 'back',
      },
      (res) => {
        console.log('CAMERA RESPONSE:', res)

        if (res.didCancel || res.errorCode) return

        const uri = res.assets?.[0]?.uri
        if (uri) {
          setImageUri(uri)
          onChange?.(uri)
        }
      }
    )
  }

  const removeImage = () => {
    setImageUri(null)
    onChange?.(null)
  }

  return (
    <Card
      backgroundColor="$card2"
      padding="$4"
      borderRadius={12}
      borderWidth={1}
      borderColor="$border"
      gap="$3"
    >
      {!imageUri ? (
        <YStack gap="$3">
          <YStack
            alignItems="center"
            justifyContent="center"
            padding="$4"
            gap="$2"
            borderRadius="$2"
            backgroundColor="$backgroundHover"
          >
            <ImageIcon size={22} opacity={0.4} />

            <Text fontSize={13} color="$text" opacity={0.5}>
              Sin imagen seleccionada
            </Text>
          </YStack>

          {/* Botones */}
          <XStack gap="$3">
            <Button
              flex={1}
              backgroundColor="$blue10"
              height={45}
              borderRadius="$3"
              justifyContent="center"
              alignItems="center"
              pressStyle={{ opacity: 0.7 }}
              onPress={takePhoto}
            >
              <XStack gap="$2" alignItems="center">
                <Camera size={18} color="black" />
                <Text color="black" fontWeight="700">
                  Cámara
                </Text>
              </XStack>
            </Button>

            <Button
              flex={1}
              backgroundColor="$buttonCancel"
              height={45}
              borderRadius="$3"
              justifyContent="center"
              alignItems="center"
              pressStyle={{ opacity: 0.7 }}
              onPress={pickImage}
            >
              <XStack gap="$2" alignItems="center">
                <ImageIcon size={18} color="black" />
                <Text color="black" fontWeight="700">
                  Galería
                </Text>
              </XStack>
            </Button>
          </XStack>
        </YStack>
      ) : (
        <YStack gap="$3">
          {/* Contenedor de imagen */}
          <YStack
            position="relative"
            borderRadius="$3"
            overflow="hidden"
            backgroundColor="$backgroundHover"
          >
            <Image
              source={{ uri: imageUri }}
              width="100%"
              height={220}
              resizeMode="cover"
            />

            {/* Botón eliminar flotante */}
            <Button
              position="absolute"
              top={10}
              right={10}
              width={34}
              height={34}
              borderRadius={999}
              backgroundColor="rgba(255, 0, 0, 0.85)"
              justifyContent="center"
              alignItems="center"
              pressStyle={{ opacity: 0.7, scale: 0.95 }}
              onPress={removeImage}
              padding={0}
            >
              <Trash2 size={16} color="white" />
            </Button>
          </YStack>
        </YStack>
      )}
    </Card>
  )
}