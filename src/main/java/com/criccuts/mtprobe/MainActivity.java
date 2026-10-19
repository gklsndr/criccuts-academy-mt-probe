package com.criccuts.mtprobe;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.TranslateRemoteModel;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Translates every job it finds with ML Kit's on-device translator, timing each string, and writes the results to
 * files/out/&lt;job&gt;.json. A job is {"target": "hi", "variant": "raw", "items": [{"id": 0, "text": "…"}]}, from the
 * APK's assets/jobs/ (written by prepare.js) or from files/in/. A job whose output is complete is skipped, so a
 * relaunch only does what is left. Progress goes to logcat under "MtProbe".
 */
public class MainActivity extends Activity {
    private static final String TAG = "MtProbe";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final StringBuilder log = new StringBuilder();
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        status = new TextView(this);
        status.setPadding(32, 96, 32, 32);
        status.setTextSize(14f);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(status);
        setContentView(scroll);
        worker.execute(this::runAll);
    }

    private void say(String line) {
        Log.i(TAG, line);
        runOnUiThread(() -> {
            log.append(line).append('\n');
            status.setText(log);
        });
    }

    private void runAll() {
        try {
            File out = new File(getFilesDir(), "out");
            //noinspection ResultOfMethodCallIgnored
            out.mkdirs();
            List<String> names = new ArrayList<>();
            List<String> bodies = new ArrayList<>();
            String[] assetJobs = getAssets().list("jobs");
            if (assetJobs != null) {
                Arrays.sort(assetJobs);
                for (String name : assetJobs) {
                    if (!name.endsWith(".json")) continue;
                    try (InputStream in = getAssets().open("jobs/" + name)) {
                        names.add(name);
                        bodies.add(readAll(in));
                    }
                }
            }
            File[] pushed = new File(getFilesDir(), "in").listFiles((dir, name) -> name.endsWith(".json"));
            if (pushed != null) {
                Arrays.sort(pushed);
                for (File f : pushed) {
                    try (InputStream in = new FileInputStream(f)) {
                        names.add(f.getName());
                        bodies.add(readAll(in));
                    }
                }
            }
            say(Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE + " · " + names.size() + " job(s)");
            for (int i = 0; i < names.size(); i++) {
                File target = new File(out, names.get(i));
                if (target.exists() && new JSONObject(readFile(target)).optBoolean("complete")) {
                    say(names.get(i) + ": already done");
                    continue;
                }
                runJob(names.get(i), new JSONObject(bodies.get(i)), target);
            }
            say("ALL_DONE");
        } catch (Exception e) {
            Log.e(TAG, "probe failed", e);
            say("FAILED: " + e);
        }
    }

    private void runJob(String name, JSONObject job, File target) throws Exception {
        String code = TranslateLanguage.fromLanguageTag(job.getString("target"));
        if (code == null) throw new IllegalArgumentException("ML Kit has no language " + job.getString("target"));
        TranslatorOptions options = new TranslatorOptions.Builder()
                .setSourceLanguage(TranslateLanguage.ENGLISH)
                .setTargetLanguage(code)
                .build();
        Translator translator = Translation.getClient(options);
        try {
            JSONObject result = new JSONObject();
            result.put("job", name);
            result.put("target", code);
            result.put("variant", job.optString("variant"));
            result.put("device", Build.MANUFACTURER + " " + Build.MODEL);
            result.put("soc", Build.VERSION.SDK_INT >= 31 ? Build.SOC_MANUFACTURER + " " + Build.SOC_MODEL : "");
            result.put("android", Build.VERSION.RELEASE);

            TranslateRemoteModel model = new TranslateRemoteModel.Builder(code).build();
            boolean hadModel = Tasks.await(RemoteModelManager.getInstance().isModelDownloaded(model));
            long bytesBefore = dirBytes(getDataDir());
            say(name + ": model " + (hadModel ? "already on the phone" : "downloading…"));
            long t0 = System.nanoTime();
            Tasks.await(translator.downloadModelIfNeeded(new DownloadConditions.Builder().build()));
            long downloadMs = (System.nanoTime() - t0) / 1_000_000;
            long modelBytes = dirBytes(getDataDir()) - bytesBefore;
            result.put("hadModel", hadModel);
            result.put("downloadMs", downloadMs);
            result.put("downloadBytes", modelBytes);
            result.put("appDataBytes", dirBytes(getDataDir()));
            say(name + ": model ready in " + downloadMs + " ms (+" + modelBytes / 1024 + " KB)");

            // The first call loads the model into memory; timed on its own so it doesn't skew the per-string numbers.
            t0 = System.nanoTime();
            Tasks.await(translator.translate("Hello."));
            result.put("warmupMs", (System.nanoTime() - t0) / 1_000_000);

            JSONArray items = job.getJSONArray("items");
            JSONArray done = new JSONArray();
            result.put("items", done);
            long start = System.nanoTime();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                JSONObject row = new JSONObject();
                row.put("id", item.get("id"));
                long s = System.nanoTime();
                try {
                    row.put("out", Tasks.await(translator.translate(item.getString("text"))));
                } catch (Exception e) {
                    row.put("error", String.valueOf(e.getCause() != null ? e.getCause() : e));
                }
                row.put("ms", (System.nanoTime() - s) / 1_000_000.0);
                done.put(row);
                if ((i + 1) % 50 == 0 || i + 1 == items.length()) {
                    long elapsed = (System.nanoTime() - start) / 1_000_000;
                    result.put("totalMs", elapsed);
                    write(target, result);
                    say(name + ": " + (i + 1) + "/" + items.length() + " in " + elapsed + " ms");
                }
            }
            result.put("complete", true);
            write(target, result);
            say(name + ": done");
        } finally {
            translator.close();
        }
    }

    private static long dirBytes(File f) {
        if (f == null || !f.exists()) return 0;
        if (f.isFile()) return f.length();
        long sum = 0;
        File[] children = f.listFiles();
        if (children != null) for (File c : children) sum += dirBytes(c);
        return sum;
    }

    /** Written whole to a temp file and renamed, so a pull mid-run never reads half a file. */
    private static void write(File target, JSONObject json) throws Exception {
        File tmp = new File(target.getPath() + ".tmp");
        try (FileOutputStream os = new FileOutputStream(tmp)) {
            os.write(json.toString(1).getBytes(StandardCharsets.UTF_8));
        }
        if (!tmp.renameTo(target)) throw new IOException("could not write " + target);
    }

    private static String readFile(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            return readAll(in);
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[16384];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        return buf.toString("UTF-8");
    }
}
