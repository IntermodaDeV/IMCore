class SessionManager {
  private listeners: (() => void)[] = []
  private forcedListeners: (() => void)[] = []

  subscribe(listener: () => void) {
    this.listeners.push(listener)

    return () => {
      this.listeners = this.listeners.filter(x => x !== listener)
    }
  }

  notifyExpired() {
    this.listeners.forEach(listener => listener())
  }

  // Cierre de sesión forzado por un administrador (distinto de "expiró").
  subscribeForced(listener: () => void) {
    this.forcedListeners.push(listener)

    return () => {
      this.forcedListeners = this.forcedListeners.filter(x => x !== listener)
    }
  }

  notifyForcedLogout() {
    this.forcedListeners.forEach(listener => listener())
  }
}

export const sessionManager = new SessionManager()