plugins {
    id("com.android.application")
}

val signingStoreFile = providers.environmentVariable("ANDROID_SIGNING_STORE_FILE").orNull
val signingStorePassword = providers.environmentVariable("ANDROID_SIGNING_STORE_PASSWORD").orNull
val signingKeyAlias = providers.environmentVariable("ANDROID_SIGNING_KEY_ALIAS").orNull
val signingKeyPassword = providers.environmentVariable("ANDROID_SIGNING_KEY_PASSWORD").orNull

android {
    namespace = "org.animelibtv.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.animelibtv.app"
        minSdk = 30
        targetSdk = 36
        versionCode = 10
        versionName = "0.3.2"
    }

    signingConfigs {
        if (
            signingStoreFile != null && signingStorePassword != null &&
            signingKeyAlias != null && signingKeyPassword != null
        ) {
            create("release") {
                storeFile = file(signingStoreFile)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
}
