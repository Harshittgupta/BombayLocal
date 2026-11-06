package xyz.unlink.scanner.store

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert

/** Registry.issuerState as last synced, plus what Arkiv said (status only). Addresses are lowercase 0x. */
@Entity(tableName = "issuer")
data class IssuerRow(
    @PrimaryKey val address: String,
    val active: Boolean,
    val floor: Long,
    val latestRootId: Long,
    /** Newest SignedRoot rootId seen on Arkiv (status only; verify never needs it). */
    val arkivRootId: Long,
    /** This scanner's key is in the issuer's latest ScannerList on Arkiv. */
    val listed: Boolean,
)

/** SPEC §5 step 9: exactly {nullifier, epochId, count, firstSeen, lastRead}. Nothing else about a scan is stored. */
@Entity(tableName = "nullifier")
data class NullifierRow(
    @PrimaryKey val nullifier: String,
    val epochId: Long,
    val count: Int,
    val firstSeenMs: Long,
    val lastReadMs: Long,
)

/** Scan-batch upload queue (SPEC §5 sync): only (epochId, nullifier); a row is deleted once the issuer accepts it. */
@Entity(tableName = "pending_scan", primaryKeys = ["epochId", "nullifier"])
data class PendingScanRow(val epochId: Long, val nullifier: String)

@Entity(tableName = "kv")
data class KvRow(@PrimaryKey val k: String, val v: String)

@Dao
interface ScannerDao {
    @Query("SELECT * FROM issuer WHERE address = :address")
    fun issuer(address: String): IssuerRow?

    @Query("SELECT * FROM issuer ORDER BY address")
    fun issuers(): List<IssuerRow>

    @Upsert
    fun upsertIssuer(row: IssuerRow)

    @Query("SELECT * FROM nullifier WHERE nullifier = :n")
    fun nullifier(n: String): NullifierRow?

    @Upsert
    fun upsertNullifier(row: NullifierRow)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun enqueue(row: PendingScanRow)

    @Transaction
    fun recordScan(row: NullifierRow) {
        upsertNullifier(row)
        enqueue(PendingScanRow(row.epochId, row.nullifier))
    }

    @Query("DELETE FROM nullifier WHERE epochId < :epochId")
    fun purgeBefore(epochId: Long)

    @Query("SELECT COUNT(*) FROM nullifier")
    fun nullifierCount(): Int

    /** Drops queue entries older than the upload window, unsent (privacy over audit completeness). */
    @Query("DELETE FROM pending_scan WHERE epochId < :epochId")
    fun dropPendingBefore(epochId: Long)

    @Query("SELECT DISTINCT epochId FROM pending_scan ORDER BY epochId")
    fun pendingEpochs(): List<Long>

    @Query("SELECT nullifier FROM pending_scan WHERE epochId = :epochId")
    fun pending(epochId: Long): List<String>

    @Query("DELETE FROM pending_scan WHERE epochId = :epochId AND nullifier IN (:nullifiers)")
    fun dequeue(epochId: Long, nullifiers: List<String>)

    @Query("SELECT v FROM kv WHERE k = :k")
    fun get(k: String): String?

    @Upsert
    fun put(row: KvRow)
}

@Database(entities = [IssuerRow::class, NullifierRow::class, PendingScanRow::class, KvRow::class], version = 1, exportSchema = false)
abstract class ScannerDb : RoomDatabase() {
    abstract fun dao(): ScannerDao

    companion object {
        @Volatile private var instance: ScannerDb? = null

        fun get(context: Context): ScannerDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, ScannerDb::class.java, "scanner.db").build().also { instance = it }
        }
    }
}
