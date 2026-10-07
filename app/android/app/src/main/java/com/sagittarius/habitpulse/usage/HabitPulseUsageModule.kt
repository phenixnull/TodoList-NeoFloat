package com.sagittarius.habitpulse.usage

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.app.usage.UsageStatsManager
import android.os.Build
import android.os.Process
import android.provider.Settings

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

import java.util.Date
import java.util.Locale
import java.text.SimpleDateFormat
import java.util.TimeZone

class HabitPulseUsageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "HabitPulseUsage"

  private val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }

  private fun hasUsageAccess(): Boolean = try {
    val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps?.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          reactContext.packageName,
      )
    } else {
      @Suppress("DEPRECATION")
      appOps?.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          reactContext.packageName,
      )
    }
    mode == AppOpsManager.MODE_ALLOWED
  } catch (error: Exception) {
    false
  }

  @ReactMethod
  fun hasUsageAccess(promise: Promise) {
    try {
      promise.resolve(hasUsageAccess())
    } catch (error: Exception) {
      promise.reject("USAGE_ACCESS_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun openUsageAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("USAGE_ACCESS_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun getInstalledApps(promise: Promise) {
    if (!hasUsageAccess()) {
      promise.reject("NO_USAGE_ACCESS", "缺少使用情况访问权限")
      return
    }

    try {
      val packageManager = reactContext.packageManager
      val launchIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val result: WritableArray = Arguments.createArray()
      val seen = mutableSetOf<String>()

      packageManager.queryIntentActivities(launchIntent, 0)
          .mapNotNull { it.activityInfo?.applicationInfo }
          .distinctBy { it.packageName }
          .filter { it.packageName != reactContext.packageName }
          .map { info ->
            Triple(
                info.packageName,
                packageManager.getApplicationLabel(info)?.toString() ?: info.packageName,
                info,
            )
          }
          .sortedWith(compareBy({ it.second.lowercase() }, { it.first }))
          .forEach { (packageName, label, _) ->
            if (seen.add(packageName)) {
              val map = Arguments.createMap()
              map.putString("packageName", packageName)
              map.putString("appName", label)
              result.pushMap(map)
            }
          }

      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("APP_LIST_FAILED", error)
    }
  }

  @ReactMethod
  fun getAppUsageSegments(packageName: String, startMs: Double, endMs: Double, promise: Promise) {
    if (!hasUsageAccess()) {
      promise.reject("NO_USAGE_ACCESS", "缺少使用情况访问权限")
      return
    }

    try {
      val manager = reactContext.getSystemService(Context.USAGE_STATS_SERVICE)
          as? UsageStatsManager ?: throw IllegalStateException("UsageStatsManager unavailable")
      val events = manager.queryEvents(startMs.toLong(), endMs.toLong())
      val event = android.app.usage.UsageEvents.Event()
      val result: WritableArray = Arguments.createArray()
      var resumedAt: Long? = null

      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val isForeground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          event.eventType == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED
        } else {
          event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND
        }
        val isBackground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          event.eventType == android.app.usage.UsageEvents.Event.ACTIVITY_PAUSED ||
              event.eventType == android.app.usage.UsageEvents.Event.ACTIVITY_STOPPED
        } else {
          event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND
        }

        if (!event.packageName.equals(packageName, ignoreCase = true)) continue

        if (isForeground) {
          resumedAt = event.timeStamp
        } else if (isBackground && resumedAt != null) {
          if (event.timeStamp > resumedAt) result.pushSegment(resumedAt, event.timeStamp)
          resumedAt = null
        }
      }

      resumedAt?.let { result.pushSegment(it, null) }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("USAGE_SEGMENTS_FAILED", error)
    }
  }

  @ReactMethod
  fun startUsageTracking(configJson: String, promise: Promise) {
    try {
      val intent = Intent(reactContext, HabitPulseUsageService::class.java)
          .putExtra(HabitPulseUsageService.EXTRA_CONFIG, configJson)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("USAGE_TRACKING_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopUsageTracking(promise: Promise) {
    try {
      val intent = Intent(reactContext, HabitPulseUsageService::class.java)
          .setAction(HabitPulseUsageService.ACTION_STOP)
      // A stop request must not enter the foreground-service start contract;
      // it immediately removes/stop itself and never calls startForeground.
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("USAGE_TRACKING_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun isUsageTrackingActive(promise: Promise) {
    promise.resolve(true)
  }

  private fun WritableArray.pushSegment(startMs: Long, stopMs: Long?) {
    val map = Arguments.createMap()
    map.putString("startAt", isoFormatter.format(Date(startMs)))
    map.putString("stopAt", stopMs?.let { isoFormatter.format(Date(it)) })
    pushMap(map)
  }
}
