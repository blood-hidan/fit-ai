# Guia para Converter MultiFit em APK Android

Este projeto está configurado como uma PWA (Progressive Web App) pronta para ser convertida em APK para dispositivos Android.

## Opção 1: PWABuilder (Recomendado - Mais Fácil)

1. **Deploy do projeto** na Vercel ou outro host
2. Acesse [PWABuilder](https://www.pwabuilder.com/)
3. Cole a URL do seu site deployado
4. Clique em "Build My PWA"
5. Selecione "Android" e baixe o pacote
6. O pacote inclui um APK assinado pronto para teste

## Opção 2: Bubblewrap (Google - Mais Controle)

### Pré-requisitos
- Node.js 14+
- Java JDK 8+
- Android SDK

### Passos

```bash
# Instalar Bubblewrap
npm install -g @anthropic/bubblewrap-cli

# Inicializar projeto (na pasta do projeto deployado)
bubblewrap init --manifest https://seu-dominio.com/manifest.json

# Configurar (siga os prompts)
# - Package ID: com.multifit.app
# - App name: MultiFit
# - Display mode: standalone
# - Theme color: #84cc16
# - Background color: #0a0b0d

# Gerar APK
bubblewrap build

# O APK será gerado em ./app-release-signed.apk
```

## Opção 3: Capacitor (Para Recursos Nativos)

Se precisar de recursos nativos adicionais:

```bash
# Instalar Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Inicializar
npx cap init MultiFit com.multifit.app

# Adicionar plataforma Android
npx cap add android

# Build do projeto web
npm run build

# Copiar para Android
npx cap copy android

# Abrir no Android Studio
npx cap open android
```

No Android Studio:
1. Build > Generate Signed Bundle / APK
2. Selecione APK
3. Crie ou use uma keystore existente
4. Selecione release
5. Clique em Finish

## Configuração do Manifest

O arquivo `public/manifest.json` já está configurado com:
- Nome e ícones do app
- Cores do tema
- Display standalone
- Orientação portrait
- Atalhos para funcionalidades principais

## Funcionalidades PWA Incluídas

- **Service Worker**: Cache offline e sincronização em background
- **Wake Lock**: Mantém a tela ligada durante rastreamento GPS
- **Geolocation**: Rastreamento preciso de corrida com filtros de ruído
- **Installable**: Pode ser instalado na tela inicial
- **Push Notifications**: Estrutura pronta para notificações

## Testando a PWA

1. Abra o Chrome DevTools (F12)
2. Vá para Application > Manifest
3. Verifique se todos os campos estão corretos
4. Vá para Application > Service Workers
5. Verifique se o SW está registrado

## Lighthouse Score

Para verificar a qualidade da PWA:
1. Chrome DevTools > Lighthouse
2. Selecione "Progressive Web App"
3. Clique em "Analyze page load"
4. Objetivo: Score > 90 em PWA

## Publicação na Play Store

1. Crie uma conta de desenvolvedor no [Google Play Console](https://play.google.com/console)
2. Crie um novo app
3. Faça upload do APK assinado
4. Complete as informações do app
5. Envie para revisão

## Resolução de Problemas

### GPS não funciona no APK
- Verifique permissões no AndroidManifest.xml
- Adicione: `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`

### App não instala
- Verifique se o APK está assinado
- Habilite "Fontes desconhecidas" nas configurações do dispositivo

### Cache não funciona offline
- Verifique se o Service Worker está registrado
- Limpe o cache do app e tente novamente
