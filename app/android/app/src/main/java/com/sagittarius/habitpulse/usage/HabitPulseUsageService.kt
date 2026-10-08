package com.sagittarius.habitpulse.usage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

import org.json.JSONArray
import org.json.JSONObject

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class HabitPulseUsageService : Service() {

  private data class TrackingTarget(
      val taskId: String,
      val packageName: String,
  )

  @Volatile
  private var serverUrl: String = ""

  @Volatile
  private var targets: List<TrackingTarget> = emptyList()

  @Volatile
  private var running: Boolean = false

  @Volatile
  private var lastPostedPayload: String = ""

  private var worker: Thread? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
    wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HabitPulse:UsageSampler")?.apply {
      acquire()
    }
    // Android requires every startForegroundService() contract to be satisfied
    // even when a queued stop/config race destroys the service immediately.
    startUsageForeground()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      try {
        File(filesDir, CONFIG_FILE_NAME).delete()
      } catch (error: Exception) {
        // Ignore cache cleanup failures.
      }
      stopTracking()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    val config = intent?.getStringExtra(EXTRA_CONFIG) ?: readSavedConfig()
    if (config.isNullOrBlank() || !applyConfig(config)) {
      stopTracking()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    startWorker()
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    worker?.interrupt()
    worker = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    super.onDestroy()
  }

  private fun applyConfig(configJson: String): Boolean = try {
    val config = JSONObject(configJson)
    serverUrl = config.optString("serverUrl").trim().trimEnd('/')
    lastPostedPayload = ""
    val rawTargets = config.optJSONArray("samples") ?: JSONArray()
    targets = (0 until rawTargets.length()).mapNotNull { index ->
      val item = rawTargets.optJSONObject(index) ?: return@mapNotNull null
      val taskId = item.optString("taskId")
      val packageName = item.optString("packageName")
      if (taskId.isBlank() || packageName.isBlank()) null else TrackingTarget(taskId, packageName)
    }
    File(filesDir, CONFIG_FILE_NAME).writeText(configJson)
    targets.isNotEmpty()
  } catch (error: Exception) {
    false
  }

  private fun readSavedConfig(): String? = try {
    val file = File(filesDir, CONFIG_FILE_NAME)
    file.takeIf { it.exists() }?.readText()
  } catch (error: Exception) {
    null
  }

  private fun startUsageForeground() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
          NotificationChannel(
              CHANNEL_ID,
              "HabitPulse 应用时长采集",
              NotificationManager.IMPORTANCE_MIN,
          ),
      )
    }

    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
        .setSmallIcon(applicationInfo.icon)
        .setContentTitle("HabitPulse 正在统计应用时长")
        .setContentText("仅记录绑定应用的前台使用时间段")
        .setOngoing(true)
        .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun startWorker() {
    worker?.interrupt()
    running = true
    worker = Thread {
      while (running && targets.isNotEmpty()) {
        try {
          sampleOnce()
        } catch (error: Exception) {
          // A transient usage-provider or network failure must not stop tracking.
        }

        try {
          Thread.sleep(SAMPLE_INTERVAL_MS)
        } catch (error: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }.apply {
      name = "HabitPulseUsageSampler"
      start()
    }
  }

  private fun stopTracking() {
    running = false
    worker?.interrupt()
    worker = null
  }

  private fun sampleOnce() {
    val now = System.currentTimeMillis()
    val dayStart = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val samples = JSONArray()

    for (target in targets) {
      val segments = JSONArray()
      for (segment in queryForegroundSegments(target.packageName, dayStart, now)) {
        val item = JSONObject()
        item.put("id", segment.first)
        item.put("startAt", segment.second)
        item.put("stopAt", segment.third ?: JSONObject.NULL)
        segments.put(item)
      }

      val sample = JSONObject()
          .put("taskId", target.taskId)
          .put("packageName", target.packageName)
          .put("segments", segments)
      samples.put(sample)
    }

    writeLocalCache(samples)
    val payload = JSONObject().put("samples", samples).toString()
    if (serverUrl.isNotEmpty() && payload != lastPostedPayload) {
      postUsageSamples(payload)
      lastPostedPayload = payload
    }
  }

  private fun queryForegroundSegments(
      packageName: String,
      startMs: Long,
      endMs: Long,
  ): List<Triple<String, String, String?>> {
    val manager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return emptyList()
    val events = manager.queryEvents(startMs, endMs)
    val event = UsageEvents.Event()
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    val result = mutableListOf<Triple<String, String, String?>>()
    var resumedAt: Long? = null

    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val isForeground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        event.eventType == UsageEvents.Event.ACTIVITY_RESUMED
      } else {
        event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
      }
      val isBackground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        event.eventType == UsageEvents.Event.ACTIVITY_PAUSED ||
            event.eventType == UsageEvents.Event.ACTIVITY_STOPPED
      } else {
        event.eventType == UsageEvents.Event.MOVE_TO_BACKGROUND
      }

      if (!event.packageName.equals(packageName, ignoreCase = true)) continue

      if (isForeground) {
        resumedAt = event.timeStamp
      } else if (isBackground && resumedAt != null) {
        if (event.timeStamp > resumedAt) {
          result.add(
              Triple(
                  usageSegmentId(packageName, resumedAt),
                  formatter.format(Date(resumedAt)),
                  formatter.format(Date(event.timeStamp)),
              ),
          )
        }
        resumedAt = null
      }
    }

    resumedAt?.let { start ->
      result.add(
          Triple(
              usageSegmentId(packageName, start),
              formatter.format(Date(start)),
              null,
          ),
      )
    }
    return result
  }

  private fun writeLocalCache(samples: JSONArray) {
    try {
      val payload = JSONObject()
          .put("updatedAt", System.currentTimeMillis())
          .put("samples", samples)
      File(filesDir, CACHE_FILE_NAME).writeText(payload.toString())
    } catch (error: Exception) {
      // Local cache is an offline convenience; direct sync is the realtime path.
    }
  }

  private fun postUsageSamples(payload: String) {
    var connection: HttpURLConnection? = null
    try {
      connection = URL("$serverUrl/api/usage/samples").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 4_000
      connection.readTimeout = 4_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      connection.setRequestProperty("Accept", "application/json")
      connection.outputStream.use { output -> output.write(payload.toByteArray(Charsets.UTF_8)) }

      val status = connection.responseCode
      if (status !in 200..299) {
        throw IllegalStateException("Usage sample sync failed: HTTP $status")
      }
    } finally {
      connection?.disconnect()
    }
  }

  companion object {
    const val ACTION_STOP = "com.sagittarius.habitpulse.usage.STOP"
    const val EXTRA_CONFIG = "config"
    private const val CHANNEL_ID = "habitpulse_app_usage"
    private const val NOTIFICATION_ID = 47821
    private const val CACHE_FILE_NAME = "habitpulse-background-usage.json"
    const val CONFIG_FILE_NAME = "habitpulse-usage-service-config.json"
    private const val SAMPLE_INTERVAL_MS = 5_000L

    private fun usageSegmentId(packageName: String, startMs: Long): String {
      val safePackage = packageName.replace(Regex("[^a-zA-Z0-9.]"), "_")
      return "app-${safePackage}-${startMs.toString(36)}"
    }
  }
}
