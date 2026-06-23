# Notificaciones push (Firebase) — Pasos para activar

El **código ya está implementado** (app + API + base de datos). Solo falta enchufar
los archivos de Firebase y aplicar la config nativa. Mientras eso no se haga, la app
funciona normal y las notificaciones simplemente no se envían (no rompe nada).

## Archivos que se necesitan (de la consola de Firebase)
1. `google-services.json` (app Android, paquete `hn.com.intermoda.imcore`)
2. `GoogleService-Info.plist` (app iOS, bundle `hn.com.intermoda.imcore`)
3. Llave **APNs `.p8`** subida en Firebase → Cloud Messaging (para push en iOS)
4. **JSON de cuenta de servicio** (Firebase → Configuración → Cuentas de servicio) → para el **API**

---

## API (.NET)
1. Copiar el JSON de cuenta de servicio al servidor (fuera del repo).
2. Configurar en `appsettings.json` o variables de entorno (`.env`):
   ```
   Notifications__Enabled=true
   Notifications__ServiceAccountPath=/ruta/al/serviceaccount.json
   Notifications__NotifyRoleIds=1
   ```
   - `NotifyRoleIds`: roles (además del creador) que reciben push. Ej. `1` (Administrador) o `1,2`. Vacío = solo el creador.
3. Redesplegar el API. (Si `Enabled=false` o falta el archivo, el API no envía y todo lo demás sigue igual.)

---

## Android (app)
1. Colocar `google-services.json` en `android/app/`.
2. En `android/build.gradle` (raíz), dentro de `buildscript { dependencies { ... } }`:
   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```
3. Al final de `android/app/build.gradle`:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
4. (El permiso `POST_NOTIFICATIONS` ya se solicita desde la app en Android 13+.)

## iOS (app)
✅ **Ya aplicado en el repo:**
- `GoogleService-Info.plist` en `ios/IMCore/` y agregado al target (Copy Bundle Resources).
- `ios/Podfile`: `$RNFirebaseAsStaticFramework = true` + `:modular_headers => true` en los pods de Firebase.
- `AppDelegate.swift`: `FirebaseApp.configure()`.
- `pod install` ejecutado (Firebase 12.x integrado).

⏳ **Falta (requiere la membresía de Apple aprobada):**
1. En Xcode → target IMCore → **Signing & Capabilities**: agregar **Push Notifications** y **Background Modes → Remote notifications**.
2. Compilar en un **dispositivo físico** (el push no funciona en simulador) con un perfil de aprovisionamiento que tenga Push habilitado.
3. La llave APNs `.p8` ya está subida en Firebase → Cloud Messaging.

## Handler de background (ambas plataformas)
En `index.js`, **después** de tener la config nativa lista, agregar al inicio:
```js
import messaging from '@react-native-firebase/messaging'
messaging().setBackgroundMessageHandler(async () => {})
```
(No agregarlo antes de tener Firebase configurado: crashea el arranque.)

---

## Cómo funciona
- Al **iniciar sesión**, la app pide permiso, obtiene el token FCM y lo registra en
  `POST api/Notifications/RegisterDevice`. Al **cerrar sesión**, lo da de baja.
- Cuando el guardia escanea un QR y se registra **entrada** o **salida**, el API
  (`VisitasServices.Validar`) llama a `SP_GetVisitaNotifyTokens` (creador del pase +
  roles configurados) y envía la push por FCM. Los tokens inválidos se desactivan solos.
