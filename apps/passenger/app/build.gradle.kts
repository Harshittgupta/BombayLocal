import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// The live Sepolia deployment is the single source of truth for which Registry and issuer the app trusts.
@Suppress("UNCHECKED_CAST")
val sepolia = (JsonSlurper().parse(rootProject.file("../../deployments.json")) as Map<String, Any>)["sepolia"] as Map<String, Any>

android {
    namespace = "xyz.unlink.passenger"
    compileSdk = 36

    defaultConfig {
        applicationId = "xyz.unlink.passenger"
        minSdk = 28
        targetSdk = 36
        versionCode = 2
        versionName = "0.7.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("long", "CHAIN_ID", "${sepolia["chainId"]}L")
        buildConfigField("String", "REGISTRY", "\"${sepolia["registry"]}\"")
        buildConfigField("String", "ISSUER", "\"${sepolia["issuer"]}\"")
        // Endpoint defaults; all three are editable in Settings (SPEC §8: RPC and Arkiv endpoints are configurable).
        buildConfigField("String", "ARKIV_RPC_DEFAULT", "\"https://rpc.rabdi.db-chain.testnet.arkiv.network\"")
        buildConfigField("String", "SEPOLIA_RPC_DEFAULT", "\"https://ethereum-sepolia-rpc.publicnode.com\"")
        // The demo issuer runs on the laptop; `adb reverse tcp:3000 tcp:3000` makes it localhost on the phone.
        buildConfigField("String", "ISSUER_URL_DEFAULT", "\"http://127.0.0.1:3000\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    // Keep the zkey and wasm stored, so WebView fetch() streams them with a correct length.
    androidResources {
        noCompress += listOf("zkey", "wasm")
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // Pinned to a late-2024 set compatible with AGP 8.13.2 (newer compose/test require AGP 9.1+).
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    // QR rendering only (core encoder; no camera, no Google ML Kit, no Play Services).
    implementation("com.google.zxing:core:3.5.3")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
