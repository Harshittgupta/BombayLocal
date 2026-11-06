import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Pure Kotlin/JVM: SPEC §5 offline verification. No android.*, no networking library (invariant 3); NoNetworkTest
// enforces it on the compiled classes and on every jar of the runtime classpath.
plugins {
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // EIP-191 signer recovery and keccak256 only (SPEC §3.3). 4.13.0 is the newest release built for JVM 17 (4.14+ need 21).
    implementation("org.web3j:crypto:4.13.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
}

tasks.test {
    // Fixtures, vk and the snarkjs used by the test engine live in the repo, two levels up.
    systemProperty("unlink.repoRoot", rootProject.projectDir.resolve("../..").canonicalPath)
    systemProperty("unlink.mainClasses", sourceSets["main"].output.classesDirs.asPath)
    systemProperty("unlink.runtimeClasspath", configurations["runtimeClasspath"].asPath)
    testLogging {
        events("failed")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
