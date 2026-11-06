package xyz.unlink.scanner.verifier

/** Strict RFC 9285 Base45 decoding (SPEC §3.4). Returns null for any invalid input; never throws. */
object Base45 {
    private const val ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
    private val INDEX = IntArray(128) { -1 }.also { t -> ALPHABET.forEachIndexed { i, c -> t[c.code] = i } }

    private fun digit(c: Char): Int = if (c.code < 128) INDEX[c.code] else -1

    fun decode(s: String): ByteArray? {
        if (s.length % 3 == 1) return null
        val out = ByteArray(s.length / 3 * 2 + if (s.length % 3 == 2) 1 else 0)
        var o = 0
        var i = 0
        while (i < s.length) {
            val c = digit(s[i])
            val d = digit(s[i + 1])
            if (c < 0 || d < 0) return null
            if (i + 2 < s.length) {
                val e = digit(s[i + 2])
                if (e < 0) return null
                val n = c + d * 45 + e * 2025
                if (n > 0xFFFF) return null
                out[o++] = (n shr 8).toByte()
                out[o++] = n.toByte()
                i += 3
            } else {
                val n = c + d * 45
                if (n > 0xFF) return null
                out[o++] = n.toByte()
                i += 2
            }
        }
        return out
    }

    fun encode(b: ByteArray): String {
        val sb = StringBuilder(b.size / 2 * 3 + 2)
        var i = 0
        while (i + 1 < b.size) {
            val n = (b[i].toInt() and 0xFF) * 256 + (b[i + 1].toInt() and 0xFF)
            sb.append(ALPHABET[n % 45]).append(ALPHABET[n / 45 % 45]).append(ALPHABET[n / 2025])
            i += 2
        }
        if (b.size % 2 == 1) {
            val n = b.last().toInt() and 0xFF
            sb.append(ALPHABET[n % 45]).append(ALPHABET[n / 45])
        }
        return sb.toString()
    }
}
