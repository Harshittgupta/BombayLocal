import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The live Sepolia deployment and the circuit manifest are the single sources of truth for what the scanner trusts.
@Suppress("UNCHECKED_CAST")
val sepolia = (JsonSlurper().parse(rootProject.file("../../deployments.json")) as Map<String, Any>)["sepolia"] as Map<String, Any>
@Suppress("UNCHECKED_CAST")
val circuitHashes = (JsonSlurper().parse(rootProject.file("../../circuits/artifacts/manifest.json")) as Map<String, Any>)["sha256"] as Map<String, Any>

android {
    namespace = "xyz.unlink.scanner"
    compileSdk = 36

    defaultConfig {
        applicationId = "xyz.unlink.scanner"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.8.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("long", "CHAIN_ID", "${sepolia["chainId"]}L")
        buildConfigField("String", "REGISTRY", "\"${sepolia["registry"]}\"")
        buildConfigField("String", "AUTHORITY", "\"${sepolia["authority"]}\"")
        // SPEC §5 sync: a VerifyKey from Arkiv is accepted only if its sha256 equals this pinned hash.
        buildConfigField("String", "VK_HASH", "\"${circuitHashes["verification_key.json"]}\"")
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
        buildConfig = true
    }
    packaging {
        resources.excludes += listOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/versions/9/OSGI-INF/MANIFEST.MF", "/META-INF/DEPENDENCIES", "/META-INF/INDEX.LIST", "/META-INF/DISCLAIMER")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":verifier"))
    implementation("androidx.webkit:webkit:1.12.1")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
