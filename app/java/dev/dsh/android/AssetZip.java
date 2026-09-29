package dev.dsh.android;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.zip.ZipFile;

/**
 * java.util.zip.ZipFile needs a file, and hot.json only exists inside the asset
 * archive. Staging the ~20 KB asset to read one entry is cheaper than a second
 * zip reader, and it is deleted immediately.
 */
final class AssetZip {

    private AssetZip() {
    }

    static ZipFile open(Context ctx, String asset) throws IOException {
        File staged = new File(App.i().tmpDir, asset + ".read");
        try (java.io.InputStream in = ctx.getAssets().open(asset);
             OutputStream out = new FileOutputStream(staged)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        }
        ZipFile zip = new ZipFile(staged);
        staged.deleteOnExit();
        return zip;
    }
}
