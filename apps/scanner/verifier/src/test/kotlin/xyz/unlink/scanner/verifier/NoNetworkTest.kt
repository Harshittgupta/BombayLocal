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
}
