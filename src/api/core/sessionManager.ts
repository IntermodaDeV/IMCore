class SessionManager {
  private listeners: (() => void)[] = []

  subscribe(listener: () => void) {
    this.listeners.push(listener)

    return () => {
      this.listeners = this.listeners.filter(x => x !== listener)
    }
  }

  notifyExpired() {
    this.listeners.forEach(listener => listener())
  }
}

export const sessionManager = new SessionManager()