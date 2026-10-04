import { defineConfig, type Plugin, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

function phoneBannerPlugin(): Plugin {
  return {
    name: 'phone-banner-plugin',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          const networkUrl = server.resolvedUrls?.network?.[0];
          console.log('\n📱 ========================================================');
          console.log('   PHONE TESTING SERVER (HTTPS + LAN ENABLED)');
          if (networkUrl) {
            console.log(`   🔗 Phone URL: \x1b[1m\x1b[32m${networkUrl}\x1b[0m`);
          } else {
            console.log('   🔗 Accessible on your laptop IP via: https://<laptop-ip>:5173/KARAGIR-APP-/');
          }
          console.log('   📶 Make sure your phone and laptop are on the same WiFi.');
          console.log('   🔒 Open the link in Chrome/Safari on your phone and');
          console.log('      tap "Advanced" -> "Proceed" to accept the certificate once.');
          console.log('========================================================\n');
        }, 150);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDemo = env.VITE_DEMO_MODE === 'true';
  const isPhone = mode === 'phone' || mode === 'demo-phone' || process.env.VITE_DEV_PHONE === 'true';

  if (command === 'build' && isDemo && mode !== 'demo') {
    console.error('\n❌ ERROR: Production build failed!');
    console.error('❌ VITE_DEMO_MODE is set to true in your environment.');
    console.error('❌ You must not deploy demo mode to production.');
    console.error('❌ If you intentionally want a demo build, run: npm run build:demo\n');
    process.exit(1);
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isPhone ? [basicSsl(), phoneBannerPlugin()] : []),
    ],
    base: '/KARAGIR-APP-/',
    server: isPhone
      ? {
          host: true,
        }
      : {},
  };
});


