import AsyncStorage from '@react-native-async-storage/async-storage'
import Config from 'react-native-config'
import { sessionManager } from '../core/sessionManager'

export async function refreshAccessToken() {
  
  try {
    const refreshToken = await AsyncStorage.getItem('refreshToken')
    if (!refreshToken) {
      return null
    }

    const response = await fetch(`${Config.API_URL}Security/refreshToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      if (response.status === 401 || response.status === 400) {

        await AsyncStorage.removeItem('refreshToken')
        await AsyncStorage.removeItem('accessToken')

        sessionManager.notifyExpired()
      }

      return null
    }

    await AsyncStorage.setItem('accessToken', data.AccessToken)
    await AsyncStorage.setItem('refreshToken', data.RefreshToken)

    return data.AccessToken
  } catch (error) {
    console.log('[RefreshToken] Error de red:', error)
    return null
  }
}