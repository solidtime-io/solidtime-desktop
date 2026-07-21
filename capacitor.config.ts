import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'io.solidtime.mobile',
    appName: 'solidtime',
    // Output of `npm run build:ios` (vite.config.ios.ts). Contains index.html.
    webDir: 'dist-ios',
    // NOTE: the WebView's own serving scheme is left as Capacitor's default. The
    // solidtime:// OAuth callback is registered as an EXTERNAL URL scheme in
    // ios/App/App/Info.plist (CFBundleURLTypes) and surfaced via @capacitor/app.
}

export default config
