import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ThemeMode, useTheme } from '../theme/theme';
import GlassCard from '@/components/GlassCard';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import {
  downloadUpdate,
  getDownloadedApk,
  fetchUpdateManifest,
  getCurrentVersionCode,
  getCurrentVersionName,
  installApk,
  isNewer,
  UpdateManifest,
} from '@/services/appUpdate';
import { useHabitStore } from '@/store/useHabitStore';

type UpdateUiState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'uptodate' }
  | { phase: 'available'; manifest: UpdateManifest; alreadyDownloaded?: boolean }
  | { phase: 'downloading'; progress: number; manifest: UpdateManifest }
  | { phase: 'error'; message: string };

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, syncState, updateSettings, syncNow } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const [updateState, setUpdateState] = useState<UpdateUiState>({ phase: 'idle' });
  const currentVersionCode = getCurrentVersionCode();
  const currentVersionName = getCurrentVersionName();
  const appearanceModes: { key: ThemeMode; label: string }[] = [
    { key: 'light', label: '浅色' },
    { key: 'dark', label: '深色' },
    { key: 'system', label: '跟随系统' },
  ];

  const checkForUpdates = async () => {
    setUpdateState({ phase: 'checking' });

    try {
      const manifest = await fetchUpdateManifest(settings.serverUrl);

      if (isNewer(manifest, currentVersionCode)) {
        const downloaded = await getDownloadedApk(manifest);
        setUpdateState({ phase: 'available', manifest, alreadyDownloaded: !!downloaded });
      } else {
        setUpdateState({ phase: 'uptodate' });
      }
    } catch (error) {
      setUpdateState({
        phase: 'error',
        message: error instanceof Error ? error.message : '检查更新失败',
      });
    }
  };

  const performUpdate = async (manifest: UpdateManifest) => {
    setUpdateState({ phase: 'downloading', progress: 0, manifest });

    try {
      // Check if already downloaded
      const downloaded = await getDownloadedApk(manifest);
      if (downloaded) {
        await installApk(downloaded.localUri);
        setUpdateState({ phase: 'available', manifest });
        return;
      }

      const uri = await downloadUpdate(settings.serverUrl, manifest, (progress) => {
        setUpdateState({ phase: 'downloading', progress, manifest });
      });
      await installApk(uri);
      // Stay on "downloading/complete" until the system installer takes over.
      setUpdateState({ phase: 'available', manifest });
    } catch (error) {
      setUpdateState({
        phase: 'error',
        message: error instanceof Error ? error.message : '下载更新失败',
      });
    }
  };

  // Check once on first open.
  useEffect(() => {
    if (Platform.OS === 'android' && settings.syncEnabled && settings.serverUrl.trim()) {
      const timer = setTimeout(() => {
        void checkForUpdates();
      }, 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android may keep this JS screen behind the system install-permission page.
  // When the user returns, the download is already complete: restore the
  // actionable state instead of leaving the button stuck at 100%.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      setUpdateState((prev) => (
        prev.phase === 'downloading'
          ? { phase: 'available', manifest: prev.manifest }
          : prev
      ));
    });
    return () => subscription.remove();
  }, []);

  const updateStatusText = (() => {
    switch (updateState.phase) {
      case 'checking':
        return '正在检查更新...';
      case 'uptodate':
        return `已是最新版本 v${currentVersionName}`;
      case 'available':
        return `发现新版本 v${updateState.manifest.versionName}`;
      case 'downloading':
        return `正在下载更新 ${Math.round(updateState.progress * 100)}%`;
      case 'error':
        return updateState.message;
      default:
        return `当前版本 v${currentVersionName}`;
    }
  })();

  const updateButton = (() => {
    switch (updateState.phase) {
      case 'checking':
      case 'downloading':
        return { label: '请稍候', icon: 'progress-clock', disabled: true, onPress: () => {} };
      case 'available':
        return {
          label: `立即更新到 v${updateState.manifest.versionName}`,
          icon: 'download-outline',
          disabled: false,
          onPress: () => void performUpdate(updateState.manifest),
        };
      default:
        return { label: '检查更新', icon: 'refresh', disabled: false, onPress: () => void checkForUpdates() };
    }
  })();

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[styles.title, { color: theme.text }]}>设置</Text>

      <GlassCard style={styles.card}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>外观</Text>
        <View style={styles.appearanceRow}>
          {appearanceModes.map((mode) => {
            const selected = (settings.appearance ?? 'dark') === mode.key;

            return (
              <PressableScale
                key={mode.key}
                accessibilityLabel={`使用${mode.label}主题`}
                onPress={() => updateSettings({ appearance: mode.key })}
                style={[
                  styles.appearanceButton,
                  {
                    borderColor: selected ? theme.accent : theme.inputBorder,
                    backgroundColor: selected ? theme.accentBackground : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.appearanceText, { color: selected ? theme.accentText : theme.mutedText }]}>
                  {mode.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>服务端同步</Text>
            <Text style={[styles.cardText, { color: theme.subtleText }]}>关闭时数据只保存在本机。</Text>
          </View>
          <Switch
            value={settings.syncEnabled}
            onValueChange={(value) => updateSettings({ syncEnabled: value })}
            trackColor={{
              false: theme.isLight ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.12)',
              true: theme.accent,
            }}
            thumbColor={theme.isLight ? '#0f172a' : '#f8fafc'}
          />
        </View>

        <Text style={[styles.label, { color: theme.mutedText }]}>API 地址</Text>
        <TextInput
          value={settings.serverUrl}
          onChangeText={(value) => updateSettings({ serverUrl: value })}
          placeholder="http://10.0.2.2:8787"
          placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, {
            backgroundColor: theme.inputBackground,
            borderColor: theme.inputBorder,
            color: theme.text,
          }]}
        />

        <PressableScale
          style={[styles.testButton, { backgroundColor: theme.accent }]}
          onPress={() => void syncNow()}
        >
          <MaterialCommunityIcons name="cloud-sync-outline" size={20} color={theme.onAccent} />
          <Text style={[styles.testText, { color: theme.onAccent }]}>立即同步</Text>
        </PressableScale>

        <Text style={[styles.status, { color: theme.subtleText }]}>
          {syncState.status === 'syncing'
            ? '正在连接服务端...'
            : syncState.status === 'ok'
              ? `同步成功${settings.lastSyncedAt ? ` · ${new Date(settings.lastSyncedAt).toLocaleTimeString('zh-CN')}` : ''}`
              : syncState.status === 'error'
                ? `同步失败 · ${syncState.message ?? '请检查地址'}`
                : settings.syncEnabled
                  ? '等待同步'
                  : '本地模式'}
        </Text>
      </GlassCard>

      {Platform.OS === 'android' && (
        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>版本与更新</Text>
          <Text style={[styles.cardText, { color: theme.subtleText }]}>
            检查服务端是否有新版本，确认后自动下载并调起系统安装，无需手动传 APK。
          </Text>

          {updateState.phase === 'available' && (
            <View style={styles.notesBox}>
              {updateState.manifest.releaseNotes.map((line) => (
                <Text key={line} style={[styles.noteLine, { color: theme.mutedText }]}>· {line}</Text>
              ))}
            </View>
          )}

          <PressableScale
            disabled={updateButton.disabled}
            style={[
              styles.testButton,
              { backgroundColor: updateButton.disabled ? theme.surface : theme.accent },
            ]}
            onPress={updateButton.onPress}
          >
            <MaterialCommunityIcons
              name={updateButton.icon as any}
              size={20}
              color={updateButton.disabled ? theme.mutedText : theme.onAccent}
            />
            <Text
              style={[
                styles.testText,
                { color: updateButton.disabled ? theme.mutedText : theme.onAccent },
              ]}
            >
              {updateButton.label}
            </Text>
          </PressableScale>

          <Text
            style={[
              styles.status,
              {
                color: updateState.phase === 'error' ? '#f87171' : theme.subtleText,
              },
            ]}
          >
            {updateStatusText}
          </Text>
        </GlassCard>
      )}

      <GlassCard>
        <Text style={[styles.cardTitle, { color: theme.text }]}>安卓局域网提示</Text>
        <Text style={[styles.cardText, { color: theme.subtleText }]}>
          Android 模拟器访问电脑服务端使用 http://10.0.2.2:8787。真机请使用电脑局域网 IP，并保证服务端监听 0.0.0.0。
        </Text>
      </GlassCard>

      <PressableScale
        style={[styles.feedbackButton, { borderColor: 'rgba(251,191,36,0.2)', backgroundColor: 'rgba(251,191,36,0.05)' }]}
        onPress={() => router.push('/feedback' as never)}
      >
        <MaterialCommunityIcons name="bug-outline" size={20} color="#fbbf24" />
        <Text style={[styles.feedbackText, { color: '#fbbf24' }]}>问题反馈</Text>
      </PressableScale>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '900',
  },
  card: {
    gap: 16,
  },
  appearanceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  appearanceButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceText: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  cardText: {
    color: 'rgba(226,232,240,0.65)',
    lineHeight: 21,
    marginTop: 5,
  },
  notesBox: {
    gap: 4,
  },
  noteLine: {
    fontSize: 12,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchCopy: {
    flex: 1,
  },
  label: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(2,6,23,0.35)',
    borderRadius: 16,
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  testButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  testText: {
    color: '#04121a',
    fontWeight: '800',
  },
  status: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  feedbackButton: {
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  feedbackText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
