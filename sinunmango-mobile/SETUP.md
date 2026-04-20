# sinunmango mobile — Setup

## Requisitos
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- App **Expo Go** instalada en el celular (para desarrollo)

## 1. Instalar dependencias
```bash
cd sinunmango-mobile
npm install
```

## 2. Configurar variables de entorno
```bash
cp .env.example .env
```
Editá `.env` y completá:
- `EXPO_PUBLIC_SUPABASE_URL` — de supabase.com → Settings → API
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — ídem
- `EXPO_PUBLIC_API_URL` — URL de tu app en Vercel (ej: https://sinunmango.vercel.app)

## 3. Configurar Supabase para OAuth mobile
En el dashboard de Supabase → Authentication → URL Configuration, agregá:
```
sinunmango://(tabs)/manguito
```
como URL de redirección permitida.

## 4. Agregar assets
Copiá estos archivos a la carpeta `assets/`:
- `icon.png` — logo de la app (1024x1024 recomendado)
- `splash.png` — pantalla de splash (1242x2436)
- `adaptive-icon.png` — para Android (1024x1024)

Podés usar `public/logo.png` del proyecto web como base.

## 5. Correr en desarrollo
```bash
npx expo start
```
Escaneá el QR con Expo Go (Android) o la cámara (iOS).

## 6. Build para Android (APK)
Con Expo EAS (recomendado):
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

## Estructura
```
app/
  _layout.tsx          # Root layout — maneja auth
  (auth)/
    login.tsx          # Login con Google
  (tabs)/
    _layout.tsx        # Bottom tabs
    nuevo.tsx          # Nuevo movimiento + OCR
    manguito.tsx       # Chat con Manguito IA
lib/
  supabase.ts          # Cliente Supabase
  api.ts               # Helper para llamar a la API web
constants/
  theme.ts             # Colores del theme (igual a la web)
```
