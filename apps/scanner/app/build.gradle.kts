import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
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
        // The demo deployment's issuer (tests and status only; the scanner trusts every active issuer in the Registry).
        buildConfigField("String", "DEPLOYMENT_ISSUER", "\"${sepolia["issuer"]}\"")
        // SPEC §5 sync: a VerifyKey from Arkiv is accepted only if its sha256 equals this pinned hash.
        buildConfigField("String", "VK_HASH", "\"${circuitHashes["verification_key.json"]}\"")
        // Sync endpoints; all editable in Settings (SPEC §8). The backup RPC is a second, independent provider.
        buildConfigField("String", "SEPOLIA_RPC_DEFAULT", "\"https://ethereum-sepolia-rpc.publicnode.com\"")
        buildConfigField("String", "SEPOLIA_RPC_BACKUP_DEFAULT", "\"https://sepolia.drpc.org\"")
        buildConfigField("String", "ARKIV_RPC_DEFAULT", "\"https://rpc.rabdi.db-chain.testnet.arkiv.network\"")
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
    // Scanner key: secp256k1 signing of scan batches and keccak selectors. Same pin and exclusions as :verifier
    // (only web3j utils + bcprov at runtime; no tuweni/connid/jc-kzg natives/jackson).
    implementation("org.web3j:crypto:4.13.0") {
        exclude(group = "io.tmio")
        exclude(group = "org.connid")
        exclude(group = "io.consensys.protocols")
        exclude(group = "com.fasterxml.jackson.core")
        exclude(group = "org.slf4j")
        exclude(group = "org.web3j", module = "abi")
        exclude(group = "org.web3j", module = "rlp")
    }
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity:1.9.3")
    // Local store (SPEC §5 step 9 nullifier log, synced issuer state, vk).
    implementation("androidx.room:room-runtime:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")
    // Camera + QR decoding: CameraX and ZXing core only (no Google ML Kit, no Play Services).
    implementation("androidx.camera:camera-camera2:1.5.3")
    implementation("androidx.camera:camera-lifecycle:1.5.3")
    implementation("androidx.camera:camera-view:1.5.3")
    implementation("com.google.zxing:core:3.5.3")
    // SyncWorker (online only, never called by verify).
    implementation("androidx.work:work-runtime:2.10.0")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
