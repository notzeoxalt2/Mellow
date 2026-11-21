package com.music.bitchord.sync

import com.music.bitchord.data.DebugLog as Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.TimeUnit

data class SyncPayload(
    val spotifySpDc: String?,
    val spotifyName: String?,
    val youtubeCookie: String?,
    val youtubeSapisid: String?,
    val youtubeAuthUser: String?,
    val youtubePageId: String?,
    val youtubeActiveName: String?,
)

object PcSyncManager {
    private const val TAG = "PcSyncManager"
    private const val PORT = 41838

    private val fastClient = OkHttpClient.Builder()
        .connectTimeout(450, TimeUnit.MILLISECONDS)
        .readTimeout(600, TimeUnit.MILLISECONDS)
        .build()

    private val claimClient = OkHttpClient.Builder()
        .connectTimeout(5000, TimeUnit.MILLISECONDS)
        .readTimeout(8000, TimeUnit.MILLISECONDS)
        .build()

    /**
     * Finds local IPv4 subnet prefix of this device on Wi-Fi/Ethernet.
     */
    fun getLocalSubnetPrefix(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val host = addr.hostAddress ?: continue
                        if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
                            val lastDot = host.lastIndexOf('.')
                            if (lastDot > 0) return host.substring(0, lastDot + 1)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get local subnet", e)
        }
        return null
    }

    /**
     * Probes an IP to check if Mellow desktop sync server is alive.
     */
    suspend fun probe(ip: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("http://$ip:$PORT/pair/probe")
                .get()
                .build()
            fastClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val json = JSONObject(body)
                    return@withContext json.optBoolean("pairReady", false) || json.optBoolean("ok", false)
                }
            }
        } catch (_: Exception) {}
        false
    }

    /**
     * Auto-discovers any Mellow desktop running on the local subnet.
     */
    suspend fun discoverPc(): String? = withContext(Dispatchers.IO) {
        val prefix = getLocalSubnetPrefix() ?: return@withContext null
        coroutineScope {
            val jobs = (1..254).map { i ->
                async {
                    val ip = "$prefix$i"
                    if (probe(ip)) ip else null
                }
            }
            val results = jobs.awaitAll()
            results.firstOrNull { it != null }
        }
    }

    /**
     * Claims the pairing session from the PC using the 6-digit sync code.
     */
    suspend fun claim(code: String, hostOrIp: String? = null): Result<SyncPayload> = withContext(Dispatchers.IO) {
        val cleanCode = code.replace("\\s|-".toRegex(), "").trim().uppercase()
        if (cleanCode.length != 6) {
            return@withContext Result.failure(IllegalArgumentException("Please enter a valid 6-digit code"))
        }

        val targetIp = hostOrIp?.trim()?.takeIf { it.isNotEmpty() } ?: discoverPc()
        if (targetIp == null) {
            return@withContext Result.failure(IllegalStateException("Could not find Mellow on PC. Ensure both devices are on the same Wi-Fi or enter your PC's IP."))
        }

        try {
            val jsonBody = JSONObject().apply { put("code", cleanCode) }
            val requestBody = jsonBody.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("http://$targetIp:$PORT/pair/claim")
                .post(requestBody)
                .build()

            claimClient.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val errJson = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val err = errJson?.optString("error") ?: "Server returned error ${response.code}"
                    return@withContext Result.failure(IllegalStateException(err))
                }

                val json = JSONObject(bodyStr)
                if (!json.optBoolean("ok", false)) {
                    val err = json.optString("error", "Sync code rejected")
                    return@withContext Result.failure(IllegalStateException(err))
                }

                val spotifyObj = json.optJSONObject("spotify")
                val ytObj = json.optJSONObject("youtube")

                val spDc = spotifyObj?.optString("spDc")?.takeIf { it.isNotEmpty() }
                val spName = spotifyObj?.optJSONObject("user")?.optString("name")

                val ytCookie = ytObj?.optString("cookie")?.takeIf { it.isNotEmpty() }
                val ytSapisid = ytObj?.optString("sapisid")?.takeIf { it.isNotEmpty() }
                val ytAuthUser = ytObj?.optString("authUser") ?: "0"
                val ytPageId = ytObj?.optString("pageId")?.takeIf { it.isNotEmpty() }
                val ytActiveName = ytObj?.optJSONObject("active")?.optString("name")

                Result.success(
                    SyncPayload(
                        spotifySpDc = spDc,
                        spotifyName = spName,
                        youtubeCookie = ytCookie,
                        youtubeSapisid = ytSapisid,
                        youtubeAuthUser = ytAuthUser,
                        youtubePageId = ytPageId,
                        youtubeActiveName = ytActiveName,
                    )
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error claiming sync code", e)
            Result.failure(e)
        }
    }
}
