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
    // Only Sign / Keys / Hash are used, which need web3j utils + bcprov. The other transitive dependencies are cut:
    // tuweni pulls org.connid (socket-based connector framework code), jc-kzg-4844 ships native libraries, and
    // jackson / slf4j / abi / rlp are unused here. NoNetworkTest scans every remaining dependency class.
    implementation("org.web3j:crypto:4.13.0") {
        exclude(group = "io.tmio")
        exclude(group = "org.connid")
        exclude(group = "io.consensys.protocols")
        exclude(group = "com.fasterxml.jackson.core")
        exclude(group = "org.slf4j")
        exclude(group = "org.web3j", module = "abi")
        exclude(group = "org.web3j", module = "rlp")
    }

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
