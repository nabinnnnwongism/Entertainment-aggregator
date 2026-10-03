/**
 * nativeApp.js — Native Android APK lifecycle & UI polish handlers
 *
 * Provides:
 *   - Android hardware back button handler
 *   - App pause / resume state detection
 *   - Native dark status bar & splash screen hiding
 *   - Deep link callback listener for Supabase OAuth
 */

function isNative() {
  return typeof window !== 'undefined' &&
    window.Capacitor !== undefined &&
    window.Capacitor.isNativePlatform?.();
}

export async function initNativeApp({
  onBackButton,
  onAppPause,
  onAppResume,
  onDeepLink,
}) {
  if (!isNative()) return;

  try {
    // 1. Hide Splash Screen & Set Dark Status Bar
    const { SplashScreen } = await import('@capacitor/splash-screen');
    const { StatusBar, Style } = await import('@capacitor/status-bar');

    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0a0a0a' });
    await SplashScreen.hide();
  } catch (e) {
    console.warn('[Native] UI Polish error:', e.message);
  }

  try {
    // 2. Register App Lifecycle & Back Button listeners
    const { App } = await import('@capacitor/app');

    // Hardware back button
    App.addListener('backButton', (data) => {
      if (onBackButton) {
        onBackButton(data);
      }
    });

    // App state changes (Pause / Resume)
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[Native App] Resumed / Active');
        if (onAppResume) onAppResume();
      } else {
        console.log('[Native App] Paused / Background');
        if (onAppPause) onAppPause();
      }
    });

    // Deep link callbacks (e.g. com.eetnet.app://callback#access_token=...)
    App.addListener('appUrlOpen', (data) => {
      console.log('[Native App] Deep link opened:', data.url);
      if (onDeepLink) onDeepLink(data.url);
    });

  } catch (e) {
    console.warn('[Native] Lifecycle listener setup error:', e.message);
  }
}
