package com.foodlenscare.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String ALIAS = "foodlenscare-session-v1";
    private SharedPreferences store() {
        return getContext().getSharedPreferences("foodlenscare_sessions", Context.MODE_PRIVATE);
    }
    private String origin(PluginCall call) throws Exception {
        String value = call.getString("origin", "");
        URI uri = new URI(value);
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) {
            throw new IllegalArgumentException("Invalid server origin");
        }
        return value;
    }
    private String key(String origin) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(origin.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }
    private SecretKey encryptionKey() throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        if (keys.containsAlias(ALIAS)) return (SecretKey) keys.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    @PluginMethod
    public synchronized void get(PluginCall call) {
        try {
            String origin = origin(call);
            String saved = store().getString(key(origin), "");
            String value = "";
            if (!saved.isEmpty()) {
                String[] parts = saved.split(":", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                cipher.updateAAD(origin.getBytes(StandardCharsets.UTF_8));
                value = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            }
            JSObject result = new JSObject(); result.put("value", value); call.resolve(result);
        } catch (Exception error) { call.reject("Cannot read encrypted app session"); }
    }
    @PluginMethod
    public synchronized void set(PluginCall call) {
        try {
            String origin = origin(call), value = call.getString("value", "");
            if (!value.matches("[A-Za-z0-9_-]{20,128}")) throw new IllegalArgumentException("Invalid session");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            cipher.updateAAD(origin.getBytes(StandardCharsets.UTF_8));
            String saved = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!store().edit().putString(key(origin), saved).commit()) throw new IllegalStateException("Storage failed");
            call.resolve();
        } catch (Exception error) { call.reject("Cannot save encrypted app session"); }
    }
    @PluginMethod
    public synchronized void remove(PluginCall call) {
        try {
            if (!store().edit().remove(key(origin(call))).commit()) throw new IllegalStateException("Storage failed");
            call.resolve();
        } catch (Exception error) { call.reject("Cannot clear app session"); }
    }
}
