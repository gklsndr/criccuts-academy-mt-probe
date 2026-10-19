// A standalone probe app, NOT part of the CricCuts build: it measures Google ML Kit's on-device translation of the
// Science Lab's English. Build it with the repo's wrapper:
//   ./gradlew.bat -p docs/tools/academy-mt-probe assembleDebug
// See README.md.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "academy-mt-probe"
