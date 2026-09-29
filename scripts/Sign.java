import com.android.apksig.ApkSigner;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

/**
 * v2 + v3 APK signing through apksig.
 *
 * v1 (jar signing) is deliberately off: it rewrites the zip and would undo the
 * alignment the packer just produced for resources.arsc and the native
 * libraries. Android 7+ verifies v2, and minSdk here is 26.
 */
public final class Sign {

    public static void main(String[] args) throws Exception {
        if (args.length < 5) {
            System.err.println("usage: Sign <in.apk> <out.apk> <keystore> <storepass> <alias> [keypass]");
            System.exit(2);
        }
        File in = new File(args[0]);
        File out = new File(args[1]);
        char[] storePass = args[3].toCharArray();
        String alias = args[4];
        char[] keyPass = (args.length > 5 ? args[5] : args[3]).toCharArray();

        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (FileInputStream input = new FileInputStream(args[2])) {
            keyStore.load(input, storePass);
        }
        PrivateKey key = (PrivateKey) keyStore.getKey(alias, keyPass);
        List<X509Certificate> chain = new ArrayList<>();
        for (java.security.cert.Certificate certificate : keyStore.getCertificateChain(alias)) {
            chain.add((X509Certificate) certificate);
        }

        ApkSigner.SignerConfig config = new ApkSigner.SignerConfig.Builder(alias, key, chain).build();
        List<ApkSigner.SignerConfig> configs = new ArrayList<>();
        configs.add(config);

        new ApkSigner.Builder(configs)
                .setInputApk(in)
                .setOutputApk(out)
                .setV1SigningEnabled(false)
                .setV2SigningEnabled(true)
                .setV3SigningEnabled(true)
                .setMinSdkVersion(26)
                .build()
                .sign();

        System.out.println("signed -> " + out + " (" + out.length() + " bytes)");
    }
}
