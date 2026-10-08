package com.sagittarius.habitpulse.usage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

import java.io.File

class HabitPulseUsageBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_LOCKED_BOOT_COMPLETED) return

    val configFile = File(context.filesDir, HabitPulseUsageService.CONFIG_FILE_NAME)
    if (!configFile.exists()) return

    val config = try {
      configFile.readText()
    } catch (error: Exception) {
      return
    }

    val serviceIntent = Intent(context, HabitPulseUsageService::class.java)
        .putExtra(HabitPulseUsageService.EXTRA_CONFIG, config)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }
  }
}
