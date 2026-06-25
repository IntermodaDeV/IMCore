import { createNavigationContainerRef } from '@react-navigation/native'

// Ref global para navegar desde fuera de componentes (ej. al tocar una
// notificación push con la app en segundo plano o cerrada).
export const navigationRef = createNavigationContainerRef<any>()

// Navega cuando el contenedor esté listo (si la app recién arranca desde una
// notificación, la navegación puede no estar montada todavía).
export function navigateWhenReady(name: string, params?: any, attempt = 0) {
  if (navigationRef.isReady()) {
    ;(navigationRef.navigate as any)(name, params)
  } else if (attempt < 40) {
    setTimeout(() => navigateWhenReady(name, params, attempt + 1), 150)
  }
}
