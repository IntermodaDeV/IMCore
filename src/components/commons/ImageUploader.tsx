import React, { useState } from 'react'
import { Button, YStack, XStack, Text, Card, View, styled } from 'tamagui'
import ImageCropPicker from 'react-native-image-crop-picker'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import { Camera, Image as ImageIcon, Trash2, Crop } from 'lucide-react-native'
import { Image, PermissionsAndroid, Platform, Pressable } from 'react-native'
import ImageViewing from 'react-native-image-viewing'

type Props = {
  title?: string
  onChange?: (uri: string | null) => void
  onChangeWithBase64?: (uri: string | null, base64: string | null) => void
}



export function ImageUploader({ title = 'Imagen', onChange, onChangeWithBase64 }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [zoomVisible, setZoomVisible] = useState(false)

  const ImageIconStyled = styled(ImageIcon, { color: '$buttonSecondaryText' })
  const CameraStyled = styled(Camera, { color: '$buttonSecondaryText' })

  const handleResult = (uri: string | null, base64: string | null) => {
    setImageUri(uri)
    onChange?.(uri)
    onChangeWithBase64?.(uri, base64)
  }

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Permiso de Cámara',
      message: 'La app necesita acceso a la cámara',
      buttonPositive: 'OK',
    })
    return granted === PermissionsAndroid.RESULTS.GRANTED
  }

  const pickImage = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 1, selectionLimit: 1, includeBase64: true },
      (res) => {
        if (res.didCancel || res.errorCode) return
        const asset = res.assets?.[0]
        if (asset?.uri) handleResult(asset.uri, asset.base64 ?? null)
      }
    )
  }

  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission()
    if (!hasPermission) return
    launchCamera(
      { mediaType: 'photo', quality: 1, cameraType: 'back', includeBase64: true },
      (res) => {
        if (res.didCancel || res.errorCode) return
        const asset = res.assets?.[0]
        if (asset?.uri) handleResult(asset.uri, asset.base64 ?? null)
      }
    )
  }

  const openCropEditor = () => {
    if (!imageUri) return
    
    ImageCropPicker.openCropper({
      cropping: true,
      mediaType: 'photo',
      includeBase64: true,
      freeStyleCropEnabled: true,
      compressImageQuality: Platform.OS === 'ios' ? 0.8 : 1,
      hideBottomControls: false,
      path: imageUri,
      ...(Platform.OS === 'ios' && { width: 800, height: 800 }),
    })
      .then(image => {
        handleResult(image.path, image.data ?? null)
      })
      .catch(() => {})
  }

  const removeImage = () => handleResult(null, null)

  return (
    <>
      <Card
        backgroundColor="$backgroundElevated"
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
              <CameraStyled size={28} opacity={0.35} />
              <Text fontSize={13} color="$text" opacity={0.6} fontWeight="600">
                Toma una foto de la factura
              </Text>
              <XStack alignItems="center" gap="$1">
                <ImageIcon size={13} opacity={0.4} />
                <Text fontSize={12} color="$textMuted">
                  o sube una imagen desde tu galería
                </Text>
              </XStack>
            </YStack>

            <XStack gap="$3">
              <Button
                flex={1}
                backgroundColor="$buttonSecondary"
                height={45}
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={takePhoto}
              >
                <XStack gap="$2" alignItems="center">
                  <CameraStyled size={18} />
                  <Text color="$buttonSecondaryText" fontWeight="700">Cámara</Text>
                </XStack>
              </Button>

              <Button
                flex={1}
                backgroundColor="transparent"
                height={45}
                border="$border"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={pickImage}
              >
                <XStack gap="$2" alignItems="center">
                  <ImageIconStyled size={18} />
                  <Text color="$buttonSecondaryText" fontWeight="700">Galería</Text>
                </XStack>
              </Button>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$3">
            <YStack position="relative" borderRadius="$3" overflow="hidden" backgroundColor="$backgroundHover">
              <Pressable onPress={() => setZoomVisible(true)}>
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
              </Pressable>

              <View position="absolute" bottom={10} right={10} flexDirection="row" gap="$2">
                <Button
                  width={34}
                  height={34}
                  borderRadius={999}
                  backgroundColor="rgba(0,0,0,0.55)"
                  justifyContent="center"
                  alignItems="center"
                  pressStyle={{ opacity: 0.7 }}
                  onPress={openCropEditor}
                  padding={0}
                >
                  <Crop size={16} color="white" />
                </Button>
                <Button
                  width={34}
                  height={34}
                  borderRadius={999}
                  backgroundColor="rgba(220, 38, 38, 0.85)"
                  justifyContent="center"
                  alignItems="center"
                  pressStyle={{ opacity: 0.7 }}
                  onPress={removeImage}
                  padding={0}
                >
                  <Trash2 size={16} color="white" />
                </Button>
              </View>
            </YStack>

            <Button
              backgroundColor="$buttonSecondary"
              height={38}
              borderRadius="$3"
              pressStyle={{ opacity: 0.7 }}
              onPress={pickImage}
            >
              <XStack gap="$2" alignItems="center">
                <ImageIconStyled size={15} />
                <Text color="$buttonSecondaryText" fontWeight="600" fontSize={13}>Reemplazar imagen</Text>
              </XStack>
            </Button>
          </YStack>
        )}
      </Card>

      <ImageViewing
        images={imageUri ? [{ uri: imageUri }] : []}
        imageIndex={0}
        visible={zoomVisible}
        onRequestClose={() => setZoomVisible(false)}
      />
    </>
  )
}
