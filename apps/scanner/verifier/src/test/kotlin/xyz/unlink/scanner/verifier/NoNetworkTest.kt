package xyz.unlink.scanner.verifier

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.zip.ZipFile

/**
 * Invariant 3: the verifier has no networking. java.net ships with every JDK, so "not on the classpath" is enforced
 * as: (a) no class compiled from :verifier references java.net, javax.net, android, okhttp3 or io.ktor; (b) no jar on
 * :verifier's runtime classpath contains an okhttp3 / io.ktor / android class or is an okhttp / ktor artifact.
 */
class NoNetworkTest {
    private val forbiddenRefs = listOf("java/net/", "javax/net/", "android/", "okhttp3/", "io/ktor/")
    private val forbiddenPackages = listOf("okhttp3/", "io/ktor/", "android/")

    /** Class names, descriptors and string constants are all UTF-8 entries of the class file's constant pool. */
    private fun refsIn(bytes: ByteArray): List<String> {
        val s = String(bytes, Charsets.ISO_8859_1)
        return forbiddenRefs.filter { s.contains(it) }
    }

    private fun prop(name: String) = System.getProperty(name) ?: error("$name not set (run through Gradle)")

    @Test
    fun detectorWorks() {
        assertEquals(listOf("java/net/"), refsIn("Ljava/net/URL;".toByteArray()))
    }

    @Test
    fun verifierClassesHaveNoNetworkingReferences() {
        val classes = prop("unlink.mainClasses").split(File.pathSeparator).map(::File).filter { it.exists() }
            .flatMap { d -> d.walkTopDown().filter { it.isFile && it.name.endsWith(".class") }.toList() }
        assertTrue("found the compiled verifier classes", classes.any { it.name == "OfflineVerifier.class" })
        val hits = classes.associate { it.name to refsIn(it.readBytes()) }.filterValues { it.isNotEmpty() }
        assertTrue("networking references in :verifier classes: $hits", hits.isEmpty())
    }

    @Test
    fun runtimeClasspathHasNoNetworkingLibrary() {
        val jars = prop("unlink.runtimeClasspath").split(File.pathSeparator).map(::File).filter { it.isFile && it.name.endsWith(".jar") }
        assertTrue("web3j crypto is on the classpath", jars.any { it.name.startsWith("crypto-") })
        val bad = mutableListOf<String>()
        for (j in jars) {
            if (Regex("okhttp|ktor", RegexOption.IGNORE_CASE).containsMatchIn(j.name)) bad += j.name
            ZipFile(j).use { z ->
                z.entries().asSequence().map { it.name }.firstOrNull { n -> forbiddenPackages.any { n.startsWith(it) } }?.let { bad += "${j.name}: $it" }
            }
        }
        assertTrue("networking libraries on the runtime classpath: $bad", bad.isEmpty())
    }

    /**
     * The only dependency classes that mention java.net, reviewed in M8a and pinned exactly: any NEW one fails.
     * kotlin-stdlib: URL.readText / Path.toUri helpers (every Kotlin program ships them). bcprov (required by web3j's
     * Sign / Hash): X.509 OCSP / CRL fetching and a URL-seeded DRBG option. None of them is reachable from
     * SignedRoot (Sign.signedPrefixedMessageToKey, Keys.getAddress, Hash.sha3), and the app has no INTERNET permission.
     */
    private val reviewedAllowlist = setOf(
        "kotlin-stdlib-2.4.21.jar: kotlin/io/TextStreamsKt.class",
        "kotlin-stdlib-2.4.21.jar: kotlin/io/path/PathsKt__PathUtilsKt.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/i18n/MissingEntryException.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jcajce/provider/asymmetric/x509/X509CertificateImpl.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jcajce/provider/drbg/DRBG\$URLSeededEntropySourceProvider\$1.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jcajce/provider/drbg/DRBG\$URLSeededEntropySourceProvider.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jcajce/provider/drbg/DRBG.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jce/provider/CertPathValidatorUtilities.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jce/provider/CrlCache.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jce/provider/OcspCache.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jce/provider/ProvOcspRevocationChecker.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/jce/provider/X509CertificateObject.class",
        "bcprov-jdk18on-1.78.1.jar: org/bouncycastle/x509/PKIXCertPathReviewer.class",
    )

    /** Review fix (M8a): every class of every dependency jar (not just package names), and no native libraries. */
    @Test
    fun noDependencyClassReferencesNetworking() {
        val jars = prop("unlink.runtimeClasspath").split(File.pathSeparator).map(::File).filter { it.isFile && it.name.endsWith(".jar") }
        val hits = mutableListOf<String>()
        for (j in jars) ZipFile(j).use { z ->
            for (e in z.entries()) {
                if (Regex("\\.(so|dll|dylib|jnilib)$").containsMatchIn(e.name)) hits += "${j.name}: native ${e.name}"
                if (!e.name.endsWith(".class")) continue
                val refs = refsIn(z.getInputStream(e).readBytes()).filter { it == "java/net/" || it == "javax/net/" }
                val key = "${j.name}: ${e.name}"
                if (refs.isNotEmpty() && key !in reviewedAllowlist) hits += "$key $refs"
            }
        }
        assertTrue("unreviewed dependency classes referencing networking:\n" + hits.joinToString("\n"), hits.isEmpty())
        assertEquals("only kotlin-stdlib, web3j crypto/utils and bcprov at runtime", setOf("kotlin-stdlib", "annotations", "crypto", "utils", "bcprov-jdk18on"),
            jars.map { it.name.substringBeforeLast('-') }.toSet())
    }
}
