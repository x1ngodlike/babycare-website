plugins {
    id("com.android.application")
}

android {
    namespace = "com.babycare.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.babycare.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 7
        versionName = "1.4.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
