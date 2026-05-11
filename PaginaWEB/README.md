# Flash Tech ARG — Guía de instalación

## Lo que necesitás hacer UNA SOLA VEZ

---

## PASO 1 — Crear proyecto en Firebase (gratis)

1. Entrá a **https://console.firebase.google.com**
2. Iniciá sesión con tu cuenta de Google
3. Click en **"Crear un proyecto"**
4. Nombre: `flashtech-arg` → Continuar → Crear proyecto

---

## PASO 2 — Activar los servicios

### 2a. Authentication (para el login del admin)
1. En el panel de Firebase → **Authentication** → Comenzar
2. Pestaña **"Sign-in method"** → Habilitar **"Correo/contraseña"**
3. Pestaña **"Users"** → Agregar usuario:
   - Email: tu email (ej: flashtecharg@gmail.com)
   - Contraseña: elegí una contraseña segura
4. **Guardá ese email y contraseña** — los vas a usar para entrar al panel admin

### 2b. Firestore (base de datos de productos)
1. En el panel → **Firestore Database** → Crear base de datos
2. Seleccioná **"Modo de producción"** → Elegí región `us-east1` → Listo
3. Ir a **Reglas** → Reemplazar todo con esto y publicar:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /productos/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### 2c. Storage (para las fotos de productos)
1. En el panel → **Storage** → Comenzar
2. Modo producción → misma región → Listo
3. Ir a **Reglas** → Reemplazar con esto y publicar:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /productos/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## PASO 3 — Copiar tus credenciales de Firebase

1. En Firebase → ⚙️ Configuración del proyecto → **"Tus apps"**
2. Click en **</>** (Web) → Registrar app (nombre: "flashtech-web")
3. Te aparece un bloque de código con esto:
```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "flashtech-arg.firebaseapp.com",
  projectId: "flashtech-arg",
  storageBucket: "flashtech-arg.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```
4. **Copiá esos valores** y pegálos en DOS archivos:
   - `public/index.html` → buscá `TU_API_KEY` y reemplazá todos los valores
   - `public/admin/index.html` → mismo reemplazo

---

## PASO 4 — Subir a Vercel (hosting gratuito)

1. Entrá a **https://vercel.com** → Sign up con Google
2. **New Project** → Import → subí la carpeta del proyecto
3. Settings → Environment Variables:
   ```
   MP_ACCESS_TOKEN = tu_access_token_de_mercadopago
   BASE_URL = https://tu-app.vercel.app
   ```
4. Deploy → ¡listo!

---

## CÓMO USAR EL PANEL ADMIN

- Entrá a: `https://tu-app.vercel.app/admin`
- Logueate con el email y contraseña que creaste en Firebase
- Desde ahí podés:
  - ➕ **Agregar** productos con foto, precio, color, batería
  - ✏️ **Editar** cualquier dato sin tocar código
  - 📸 **Cambiar fotos** subiendo desde tu celular o computadora
  - ⛔ **Ocultar** productos sin borrarlos (para cuando no tenés stock)
  - 🗑️ **Eliminar** productos

Los cambios se ven en la tienda **al instante**.

---

## TIPO DE CAMBIO

Para actualizar el tipo de cambio ARS/USD:
- En `public/index.html` buscá `const TC = 1200`
- Cambiá el número por el tipo de cambio actual
