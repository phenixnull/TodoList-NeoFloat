import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PressableScale from './PressableScale';
import {
  getInstalledApps,
  hasUsageAccess,
  openUsageAccessSettings,
} from '../services/appUsage';
import { AppUsageBinding } from '../domain/types';
import { useTheme } from '../theme/theme';
import { useHabitStore } from '../store/useHabitStore';

type Props = {
  value: AppUsageBinding | null | undefined;
  onChange: (binding: AppUsageBinding | null) => void;
};

export default function AppUsageBindingSelect({ value, onChange }: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [apps, setApps] = useState<AppUsageBinding[]>([]);
  const [query, setQuery] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;

    const refresh = async () => {
      try {
        const granted = await hasUsageAccess();
        if (active) setPermission(granted);
      } catch {
        if (active) setPermission(false);
      }
    };

    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pickerVisible || permission !== true) return;
    let active = true;

    const load = async () => {
      // Yield once so opening the modal paints before querying package metadata.
      await Promise.resolve();
      if (!active) return;

      setLoading(true);
      setError('');

      try {
        const result = await getInstalledApps();
        if (active) setApps(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取应用列表');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [pickerVisible, permission]);

  const filteredApps = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return apps;
    return apps.filter((app) => app.packageName.toLowerCase().includes(keyword)
      || app.appName?.toLowerCase().includes(keyword));
  }, [apps, query]);

  if (Platform.OS !== 'android') return null;

  return (
    <View style={styles.stack}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.mutedText }]}>绑定 APP 自动计时</Text>
        <Text style={[styles.hint, { color: theme.subtleText }]}>只记录前台使用，打卡仍需手动确认</Text>
      </View>

      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          style={[styles.selector, {
            borderColor: theme.inputBorder,
            backgroundColor: theme.inputBackground,
          }]}
          onPress={() => setPickerVisible(true)}
        >
          <MaterialCommunityIcons name="android" size={18} color={theme.accent} />
          <Text numberOfLines={1} style={[styles.selectorText, { color: theme.text }]}>
            {value?.appName || value?.packageName || '选择应用'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={theme.mutedText} />
        </PressableScale>

        {value ? (
          <PressableScale
            accessibilityLabel="解绑 APP 自动计时"
            style={styles.clearButton}
            onPress={() => onChange(null)}
          >
            <MaterialCommunityIcons name="close" size={18} color={theme.mutedText} />
          </PressableScale>
        ) : null}
      </View>

      {permission === false ? (
        <PressableScale
          style={[styles.permissionButton, { borderColor: 'rgba(251,191,36,0.35)', backgroundColor: 'rgba(251,191,36,0.08)' }]}
          onPress={() => {
            void openUsageAccessSettings().catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : '无法打开授权页');
            });
          }}
        >
          <MaterialCommunityIcons name="shield-key-outline" size={18} color="#fbbf24" />
          <Text style={[styles.permissionText, { color: '#fbbf24' }]}>授权使用情况访问</Text>
        </PressableScale>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal transparent animationType="fade" visible={pickerVisible} onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerVisible(false)}>
          <Pressable
            style={[styles.modal, {
              backgroundColor: theme.isLight ? 'rgba(255,255,255,0.98)' : '#0b1024',
              borderColor: theme.surfaceBorder,
            }]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>选择应用</Text>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索应用名或包名"
              placeholderTextColor={theme.mutedText}
              style={[styles.search, {
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
                color: theme.text,
              }]}
            />

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {loading ? (
                <Text style={[styles.listText, { color: theme.mutedText }]}>正在读取应用...</Text>
              ) : filteredApps.length ? (
                filteredApps.map((app) => (
                  <PressableScale
                    key={app.packageName}
                    style={[styles.appRow, {
                      borderColor: value?.packageName === app.packageName
                        ? theme.accent
                        : theme.surfaceBorder,
                      backgroundColor: value?.packageName === app.packageName
                        ? theme.accentBackground
                        : 'transparent',
                    }]}
                    onPress={() => {
                      onChange(app);
                      setPickerVisible(false);
                    }}
                  >
                    <View style={styles.appText}>
                      <Text numberOfLines={1} style={[styles.appName, { color: theme.text }]}>
                        {app.appName || app.packageName}
                      </Text>
                      <Text numberOfLines={1} style={[styles.packageName, { color: theme.subtleText }]}>
                        {app.packageName}
                      </Text>
                    </View>
                    {value?.packageName === app.packageName ? (
                      <MaterialCommunityIcons name="check-circle" size={20} color={theme.accent} />
                    ) : null}
                  </PressableScale>
                ))
              ) : (
                <Text style={[styles.listText, { color: theme.mutedText }]}>
                  {permission === true ? '没有找到应用' : '请先授权使用情况访问'}
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  labelRow: {
    gap: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(148,163,184,0.35)',
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 13,
  },
  permissionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '82%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  search: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  list: {
    minHeight: 120,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  appText: {
    flex: 1,
  },
  appName: {
    fontSize: 15,
    fontWeight: '700',
  },
  packageName: {
    marginTop: 2,
    fontSize: 12,
  },
  listText: {
    paddingVertical: 14,
    textAlign: 'center',
    fontSize: 13,
  },
});
