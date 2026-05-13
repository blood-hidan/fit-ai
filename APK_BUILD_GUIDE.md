# MultiFit — Build para Play Store (Android) e iOS

O projeto agora está pronto para virar app nativo via **Capacitor**.

## Pré-requisitos
- Node 18+ e Bun (ou npm)
- **Android**: Android Studio + JDK 17
- **iOS**: macOS + Xcode

## Passos (a partir do seu computador)

1. Exportar o projeto para o GitHub (botão "Export to GitHub" no Lovable) e clonar.
2. `npm install` (ou `bun install`)
3. Adicionar plataformas:
   ```bash
   npx cap add android
   npx cap add ios   # apenas em macOS
   ```
4. Atualizar dependências nativas:
   ```bash
   npx cap update android
   npx cap update ios
   ```
5. Buildar o web bundle:
   ```bash
   npm run build
   ```
6. Sincronizar com o Capacitor:
   ```bash
   npx cap sync
   ```
7. Rodar:
   ```bash
   npx cap run android   # no emulador ou aparelho conectado
   npx cap run ios
   ```

## Modo desenvolvimento (hot reload)
O `capacitor.config.json` aponta para o sandbox do Lovable, então o app abre direto a versão atualizada do preview. Para gerar build de produção (Play Store), **remova o bloco `server`** antes de buildar:
```json
// capacitor.config.json
{
  "appId": "app.lovable.333d3eeb6dc84e08a509831f5caac359",
  "appName": "MultiFit",
  "webDir": "dist"
}
```
Depois rode novamente `npm run build && npx cap sync android` e gere o AAB pelo Android Studio (Build → Generate Signed Bundle).

## Publicar na Play Store
1. Crie uma conta no [Google Play Console](https://play.google.com/console) (US$ 25, taxa única).
2. Em Android Studio: Build → **Generate Signed Bundle / APK** → AAB.
3. Faça upload no Play Console, preencha ficha da loja, screenshots e privacidade.
4. Envie para revisão.

## Próximos passos planejados
- Stories 24h (próxima entrega)
- Smartwatch (Web Bluetooth + Health Connect/HealthKit via plugin Capacitor)

Saiba mais: https://lovable.dev/blog/2025-04-25-capacitor-mobile-development
