plugins {
    // Same AGP as the app (gradle/libs.versions.toml), so nothing new is downloaded for it.
    id("com.android.application") version "8.13.2"
}

android {
    namespace = "com.criccuts.mtprobe"
    compileSdk = 36

    defaultConfig {
        // Its own package: installing it never touches the CricCuts app or its data.
        applicationId = "com.criccuts.mtprobe"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1"
    }

    // prepare.js writes the jobs here (work/ is gitignored), so the APK carries them and nothing is pushed by adb.
    sourceSets.getByName("main").assets.srcDir("work/assets")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.mlkit:translate:17.0.3")
}
