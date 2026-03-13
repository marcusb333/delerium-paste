/**
 * Storage.kt - Database schema and repository for paste storage
 * 
 * This file handles all database operations for storing and retrieving encrypted pastes.
 * Uses Exposed SQL library with PostgreSQL for persistence.
 * 
 * Key features:
 * - Automatic schema creation
 * - Secure deletion token hashing with pepper
 * - Expiration handling
 */

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.ReferenceOption
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.neq
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.transactions.transaction
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.time.Instant

/**
 * Database table definition for pastes
 *
 * All paste content (ct, iv) is stored encrypted. The decryption key never
 * touches the server - it's only present in the URL fragment on the client side.
 */
object Pastes : Table("pastes") {
    val id = varchar("id", 32).uniqueIndex()
    val ct = text("ct")
    val iv = text("iv")
    val encKeyId = varchar("enc_key_id", 64).nullable()
    val expireTs = long("expire_ts")
    val mime = varchar("mime", 128).nullable()
    val deleteTokenHash = varchar("delete_token_hash", 128)
    val deleteAuthHash = varchar("delete_auth_hash", 128).nullable()  // Password-derived delete authorization
    val createdAt = long("created_at")
    val allowKeyCaching = bool("allow_key_caching").default(false)
    val allowChat = bool("allow_chat").default(true)
}

/**
 * Database table definition for chat messages
 *
 * All messages are encrypted client-side with the paste password.
 * Messages are automatically deleted when the parent paste is deleted.
 */
object ChatMessages : Table("chat_messages") {
    val id = integer("id").autoIncrement()
    val pasteId = varchar("paste_id", 32).references(Pastes.id, onDelete = ReferenceOption.CASCADE)
    val ct = text("ct")
    val iv = text("iv")
    val encKeyId = varchar("enc_key_id", 64).nullable()
    val timestamp = long("timestamp")
    override val primaryKey = PrimaryKey(id)
}

/**
 * Repository for paste storage operations
 * 
 * Provides a high-level API for creating, retrieving, and deleting pastes.
 * All deletion tokens are hashed with a secret pepper before storage.
 * 
 * @property db Database connection
 * @property pepper Secret value mixed into deletion token hashes
 */
class PasteRepo(private val db: Database, private val pepper: String, private val keyManager: DataKeyManager) {
    init { transaction(db) { SchemaUtils.create(Pastes, ChatMessages) } }

    /**
     * Hash a deletion token with HMAC-SHA256 keyed by the pepper.
     *
     * HMAC is used instead of SHA256(pepper || token) because the keyed-MAC
     * construction is provably secure as a PRF; the concatenation variant is not.
     *
     * ⚠️  MIGRATION NOTE: Changing from the old SHA256(pepper||token) scheme to
     * HMAC-SHA256 invalidates all existing stored hashes. After deploying this
     * change, existing delete tokens and password-derived delete-auth values will
     * no longer verify. Pastes will still expire naturally; only creator-delete and
     * password-delete flows are affected for pre-existing pastes.
     */
    private fun hashToken(raw: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(pepper.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val out = mac.doFinal(raw.toByteArray(Charsets.UTF_8))
        return out.joinToString("") { "%02x".format(it) }
    }

    /**
     * Constant-time comparison for hash verification
     * Prevents timing attacks by ensuring comparison takes the same time
     * regardless of how many characters match
     * 
     * @param stored The hash stored in the database
     * @param computed The hash computed from user input
     * @return true if hashes match, false otherwise
     */
    private fun constantTimeEquals(stored: String, computed: String): Boolean {
        return MessageDigest.isEqual(stored.toByteArray(Charsets.UTF_8), computed.toByteArray(Charsets.UTF_8))
    }

    /**
     * Create a new paste in the database
     * 
     * @param id Unique paste identifier
     * @param ct Encrypted content (ciphertext)
     * @param iv Initialization vector
     * @param meta Paste metadata (expiration, etc.)
     * @param rawDeleteToken Raw deletion token (will be hashed before storage)
     * @param rawDeleteAuth Optional password-derived delete authorization (allows viewers to delete)
     */
    fun create(id: String, ct: String, iv: String, meta: PasteMeta, rawDeleteToken: String, rawDeleteAuth: String? = null) {
        val now = Instant.now().epochSecond
        val activeKeyId = keyManager.activeKeyId()
        val encCt = keyManager.encryptFieldWithKeyId(activeKeyId, ct)
        val encIv = keyManager.encryptFieldWithKeyId(activeKeyId, iv)
        transaction(db) {
            Pastes.insert {
                it[Pastes.id] = id
                it[Pastes.ct] = encCt
                it[Pastes.iv] = encIv
                it[Pastes.encKeyId] = activeKeyId
                it[Pastes.expireTs] = meta.expireTs
                it[Pastes.mime] = meta.mime
                it[Pastes.deleteTokenHash] = hashToken(rawDeleteToken)
                it[Pastes.deleteAuthHash] = rawDeleteAuth?.let { auth -> hashToken(auth) }
                it[Pastes.createdAt] = now
                it[Pastes.allowKeyCaching] = meta.allowKeyCaching ?: false
                it[Pastes.allowChat] = meta.allowChat ?: true
            }
        }
    }

    /**
     * Retrieve a paste if it exists and hasn't expired
     * 
     * @param id Paste identifier
     * @return Database row if paste exists and is not expired, null otherwise
     */
    fun getIfAvailable(id: String): ResultRow? = transaction(db) {
        val now = Instant.now().epochSecond
        Pastes.selectAll().where { Pastes.id eq id and (Pastes.expireTs greater now) }.singleOrNull()
    }

    /**
     * Retrieve a paste payload with decrypted ct/iv.
     * Lazily migrates legacy rows without enc_key_id.
     */
    fun getPayloadIfAvailable(id: String): PastePayload? = transaction(db) {
        val now = Instant.now().epochSecond
        val row = Pastes.selectAll()
            .where { Pastes.id eq id and (Pastes.expireTs greater now) }
            .singleOrNull() ?: return@transaction null
        toPayload(row)
    }

    /**
     * Delete a paste if the provided deletion token is correct
     * 
     * @param id Paste identifier
     * @param rawToken Raw deletion token to verify
     * @return true if paste was deleted, false if token didn't match or paste not found
     */
    fun deleteIfTokenMatches(id: String, rawToken: String): Boolean = transaction(db) {
        val hash = hashToken(rawToken)
        val row = Pastes.selectAll().where { Pastes.id eq id }.singleOrNull() ?: return@transaction false
        if (!constantTimeEquals(row[Pastes.deleteTokenHash], hash)) return@transaction false
        Pastes.deleteWhere { Pastes.id eq id } > 0
    }

    /**
     * Delete a paste if the provided password-derived authorization is correct
     * This allows anyone who knows the paste password to delete it
     * 
     * @param id Paste identifier
     * @param rawAuth Password-derived delete authorization
     * @return true if paste was deleted, false if auth didn't match or paste not found
     */
    fun deleteIfAuthMatches(id: String, rawAuth: String): Boolean = transaction(db) {
        val hash = hashToken(rawAuth)
        val row = Pastes.selectAll().where { Pastes.id eq id }.singleOrNull() ?: return@transaction false
        val storedHash = row[Pastes.deleteAuthHash] ?: return@transaction false  // No auth hash means feature disabled
        if (!constantTimeEquals(storedHash, hash)) return@transaction false
        Pastes.deleteWhere { Pastes.id eq id } > 0
    }

    /**
     * Delete a paste unconditionally
     * 
     * @param id Paste identifier
     * @return true if a row was deleted
     */
    fun delete(id: String): Boolean = transaction(db) {
        Pastes.deleteWhere { Pastes.id eq id } > 0
    }

    /**
     * Delete all expired pastes from the database
     * 
     * @return Number of pastes deleted
     */
    fun deleteExpired(): Int = transaction(db) {
        val now = Instant.now().epochSecond
        Pastes.deleteWhere { Pastes.expireTs lessEq now }
    }

    /**
     * Check database health by performing a simple query
     * 
     * @return true if database is healthy and responding, false otherwise
     */
    fun checkHealth(): Boolean = try {
        transaction(db) {
            // Simple count query to verify database connectivity
            Pastes.selectAll().limit(1).count()
            true
        }
    } catch (_: Exception) {
        false
    }

    /**
     * Convert a database row to an API response payload
     *
     * @param row Database row
     * @return PastePayload for API response
     */
    fun toPayload(row: ResultRow): PastePayload {
        val (ctPlain, ivPlain) = decryptOrMigratePaste(row)
        return PastePayload(
            ct = ctPlain,
            iv = ivPlain,
            meta = PasteMeta(
                expireTs = row[Pastes.expireTs],
                mime = row[Pastes.mime],
                allowKeyCaching = row[Pastes.allowKeyCaching],
                allowChat = row[Pastes.allowChat]
            )
        )
    }

    /**
     * Add a chat message to a paste
     * Maintains maximum of 50 messages per paste (FIFO deletion)
     *
     * @param pasteId Paste identifier
     * @param ct Encrypted message ciphertext
     * @param iv Initialization vector for decryption
     * @return Number of messages after insertion
     */
    fun addChatMessage(pasteId: String, ct: String, iv: String): Int = transaction(db) {
        val now = Instant.now().epochSecond
        val activeKeyId = keyManager.activeKeyId()
        val encCt = keyManager.encryptFieldWithKeyId(activeKeyId, ct)
        val encIv = keyManager.encryptFieldWithKeyId(activeKeyId, iv)

        // Insert new message
        ChatMessages.insert {
            it[ChatMessages.pasteId] = pasteId
            it[ChatMessages.ct] = encCt
            it[ChatMessages.iv] = encIv
            it[ChatMessages.encKeyId] = activeKeyId
            it[ChatMessages.timestamp] = now
        }

        // Count messages for this paste
        val count = ChatMessages.selectAll()
            .where { ChatMessages.pasteId eq pasteId }
            .count()
            .toInt()

        // If over 50 messages, delete oldest ones (FIFO)
        // Uses batch delete with Op.in() for better performance than individual deletes
        if (count > 50) {
            val oldest = ChatMessages.selectAll()
                .where { ChatMessages.pasteId eq pasteId }
                .orderBy(ChatMessages.timestamp to SortOrder.ASC)
                .limit(count - 50)
                .map { it[ChatMessages.id] }

            // Batch delete all oldest messages in a single query
            // Build OR condition for batch deletion (more efficient than individual deletes)
            if (oldest.isNotEmpty()) {
                // Delete all messages whose IDs are in the oldest list
                // Build OR condition: id = oldest[0] OR id = oldest[1] OR ...
                val conditions = oldest.map { id -> ChatMessages.id eq id }
                val combinedCondition = conditions.reduce { acc, cond -> acc or cond }
                ChatMessages.deleteWhere { combinedCondition }
            }
        }

        count.coerceAtMost(50)
    }

    /**
     * Get all chat messages for a paste
     *
     * @param pasteId Paste identifier
     * @return List of chat messages ordered by timestamp (oldest first)
     */
    fun getChatMessages(pasteId: String): List<ChatMessage> = transaction(db) {
        ChatMessages.selectAll()
            .where { ChatMessages.pasteId eq pasteId }
            .orderBy(ChatMessages.timestamp to SortOrder.ASC)
            .map { row ->
                val (ctPlain, ivPlain) = decryptOrMigrateChat(row)
                ChatMessage(
                    ct = ctPlain,
                    iv = ivPlain,
                    timestamp = row[ChatMessages.timestamp]
                )
            }
    }

    /**
     * Re-encrypt all at-rest data with the active key.
     * Returns count of rows updated (pastes + messages).
     */
    fun rotateAtRestEncryption(batchSize: Int = 200): Int {
        val activeKeyId = keyManager.activeKeyId()
        var updated = 0
        updated += rotatePastes(activeKeyId, batchSize)
        updated += rotateChatMessages(activeKeyId, batchSize)
        return updated
    }

    private fun rotatePastes(activeKeyId: String, batchSize: Int): Int {
        var total = 0
        while (true) {
            val batchCount = transaction(db) {
                val rows = Pastes.selectAll()
                    .where { Pastes.encKeyId.isNull() or (Pastes.encKeyId neq activeKeyId) }
                    .limit(batchSize)
                    .toList()
                if (rows.isEmpty()) return@transaction 0
                rows.forEach { row ->
                    val encKeyId = row[Pastes.encKeyId]
                    val ctPlain = if (encKeyId == null) row[Pastes.ct] else keyManager.decryptField(row[Pastes.ct], encKeyId)
                    val ivPlain = if (encKeyId == null) row[Pastes.iv] else keyManager.decryptField(row[Pastes.iv], encKeyId)
                    val encCt = keyManager.encryptFieldWithKeyId(activeKeyId, ctPlain)
                    val encIv = keyManager.encryptFieldWithKeyId(activeKeyId, ivPlain)
                    Pastes.update({ Pastes.id eq row[Pastes.id] }) {
                        it[Pastes.ct] = encCt
                        it[Pastes.iv] = encIv
                        it[Pastes.encKeyId] = activeKeyId
                    }
                }
                rows.size
            }
            if (batchCount == 0) break
            total += batchCount
        }
        return total
    }

    private fun rotateChatMessages(activeKeyId: String, batchSize: Int): Int {
        var total = 0
        while (true) {
            val batchCount = transaction(db) {
                val rows = ChatMessages.selectAll()
                    .where { ChatMessages.encKeyId.isNull() or (ChatMessages.encKeyId neq activeKeyId) }
                    .limit(batchSize)
                    .toList()
                if (rows.isEmpty()) return@transaction 0
                rows.forEach { row ->
                    val encKeyId = row[ChatMessages.encKeyId]
                    val ctPlain = if (encKeyId == null) row[ChatMessages.ct] else keyManager.decryptField(row[ChatMessages.ct], encKeyId)
                    val ivPlain = if (encKeyId == null) row[ChatMessages.iv] else keyManager.decryptField(row[ChatMessages.iv], encKeyId)
                    val encCt = keyManager.encryptFieldWithKeyId(activeKeyId, ctPlain)
                    val encIv = keyManager.encryptFieldWithKeyId(activeKeyId, ivPlain)
                    ChatMessages.update({ ChatMessages.id eq row[ChatMessages.id] }) {
                        it[ChatMessages.ct] = encCt
                        it[ChatMessages.iv] = encIv
                        it[ChatMessages.encKeyId] = activeKeyId
                    }
                }
                rows.size
            }
            if (batchCount == 0) break
            total += batchCount
        }
        return total
    }

    private fun decryptOrMigrate(
        encKeyId: String?,
        ct: String,
        iv: String,
        updateEncrypted: (encCt: String, encIv: String, keyId: String) -> Unit
    ): Pair<String, String> {
        if (encKeyId == null) {
            val activeKeyId = keyManager.activeKeyId()
            val encCt = keyManager.encryptFieldWithKeyId(activeKeyId, ct)
            val encIv = keyManager.encryptFieldWithKeyId(activeKeyId, iv)
            updateEncrypted(encCt, encIv, activeKeyId)
            return Pair(ct, iv)
        }
        val ctPlain = keyManager.decryptField(ct, encKeyId)
        val ivPlain = keyManager.decryptField(iv, encKeyId)
        return Pair(ctPlain, ivPlain)
    }

    private fun decryptOrMigratePaste(row: ResultRow): Pair<String, String> {
        return decryptOrMigrate(
            row[Pastes.encKeyId],
            row[Pastes.ct],
            row[Pastes.iv]
        ) { encCt, encIv, keyId ->
            Pastes.update({ Pastes.id eq row[Pastes.id] }) {
                it[Pastes.ct] = encCt
                it[Pastes.iv] = encIv
                it[Pastes.encKeyId] = keyId
            }
        }
    }

    private fun decryptOrMigrateChat(row: ResultRow): Pair<String, String> {
        return decryptOrMigrate(
            row[ChatMessages.encKeyId],
            row[ChatMessages.ct],
            row[ChatMessages.iv]
        ) { encCt, encIv, keyId ->
            ChatMessages.update({ ChatMessages.id eq row[ChatMessages.id] }) {
                it[ChatMessages.ct] = encCt
                it[ChatMessages.iv] = encIv
                it[ChatMessages.encKeyId] = keyId
            }
        }
    }
}
