# Tank Arena for Android

The Capacitor client bundles the same HTML/TypeScript/Canvas game as the browser. No separate game implementation or server is required. Both clients use the same WebSocket protocol.

## Get an APK from GitHub
Open Actions → Android APK → select a successful run on your branch → Artifacts → Tank-Arena-Android. Extract the ZIP and install app-debug.apk on Android. You may need to permit installation from your file manager. This is a debug-signed APK for testing, not a Play Store release. GitHub may generate a different debug signing key on separate runners; uninstall an older debug APK if Android rejects an update due to a signing mismatch (this deletes local preferences). For distribution, configure a persistent release signing key.

## Play
Start the server on a computer (npm start). Join the same Wi-Fi, enter the LAN address printed by the server, e.g. 192.168.1.5:3000, tap Connect, then Play. For internet hosting enter an HTTPS origin such as https://arena.example.com; the reverse proxy must forward /ws WebSocket upgrades. The APK is a client, not a server or an offline game. Local HTTP/WebSocket traffic is unencrypted; use trusted LANs and HTTPS/WSS on the public internet. Developer mode should be disabled for public hosting.

## Build locally (Windows CMD)
Install Node.js 22+, JDK 21 and Android Studio with Android SDK 35. Set JAVA_HOME and ANDROID_HOME if needed.

```cmd
npm ci
npm install --prefix mobile
npm run android:apk
```

APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk.

Open the generated project in Android Studio: npm --prefix mobile run open (after npm run android:prepare).

The generated native project is ignored; mobile/native contains versioned Android resources and MainActivity. The preparation script copies the browser build and native bridge, runs Capacitor sync, and applies the native overlay. Mobile dependencies are isolated from the root browser dependency lockfile. Every commit builds a fresh debug APK in CI.

Native features: immersive landscape, keep screen awake, Android splash and tank icon, persistent recent server origins, reconnect and haptics for heavy shots, damage, pickups and death. Vibration is optional in settings. English/Persian RTL and light/dark themes are shared with the browser. Browser builds keep same-origin connections and don't load the native bridge.

Test on a physical Android phone; a successful Gradle build does not verify device-specific keyboard, networking, gesture navigation, or haptics behavior.
