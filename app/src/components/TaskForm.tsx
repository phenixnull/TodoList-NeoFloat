import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ReactNode, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import GlassCard from './GlassCard';
import PressableScale from './PressableScale';
import GroupSelect from './GroupSelect';
import { taskColors, taskIcons } from '../domain/taskAppearance';
import { Task } from '../domain/types';
import { isTimerRunning } from '../domain/timeTracking';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  title: string;
  submitLabel: string;
  initialTask?: Task;
  defaultIcon?: string;
  defaultColor?: string;
  defaultIconImage?: string | null;
  footer?: ReactNode;
  navigateBackOnSubmit?: boolean;
  onSubmit: (input: {
    name: string;
    description: string;
    icon: string;
    color: string;
    iconImage: string | null;
    customGroups: string[];
  }) => void;
};

export default function TaskForm({
  title,
  submitLabel,
  initialTask,
  defaultIcon,
  defaultColor,
  defaultIconImage,
  footer,
  navigateBackOnSubmit = true,
  onSubmit,
}: Props) {
  const router = useRouter();
  const { settings, updateSettings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const [name, setName] = useState(initialTask?.name ?? '');
  const [description, setDescription] = useState(initialTask?.description ?? '');
  const [icon, setIcon] = useState<string>(initialTask?.icon ?? defaultIcon ?? taskIcons[0]);
  const [color, setColor] = useState<string>(initialTask?.color ?? defaultColor ?? taskColors[0]);
  const [iconImage, setIconImage] = useState<string | null>(
    initialTask?.iconImage ?? defaultIconImage ?? null,
  );
  const [customGroups, setCustomGroups] = useState<string[]>(initialTask?.customGroups ?? []);
  const [error, setError] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const assignableGroups = Array.from(new Set([
    ...(settings.customGroups ?? []),
    ...(initialTask?.customGroups ?? []),
  ]));

  const createFormGroup = (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    const currentGroups = settings.customGroups ?? [];
    if (!currentGroups.includes(name)) {
      updateSettings({ customGroups: [...currentGroups, name] });
    }
    setCustomGroups((prev) => prev.includes(name) ? prev : [...prev, name]);
  };
  const save = () => {
    if (!name.trim()) {
      setError('请输入任务名称');
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit({ name, description, icon, color, iconImage, customGroups });
    if (navigateBackOnSubmit) {
      router.back();
    }
  };

  const pickCustomIcon = async () => {
    setProcessingImage(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('无法访问图片', '请在系统设置中允许 HabitPulse 访问照片。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.88,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0]!;
      const width = Number(asset.width ?? 0);
      const height = Number(asset.height ?? 0);
      const actions: ImageManipulator.Action[] = [];

      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        const side = Math.min(width, height);
        actions.push({
          crop: {
            originX: Math.floor((width - side) / 2),
            originY: Math.floor((height - side) / 2),
            width: side,
            height: side,
          },
        });
      }

      actions.push({ resize: { width: 512, height: 512 } });
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        {
          format: ImageManipulator.SaveFormat.JPEG,
          compress: 0.82,
          base64: true,
        },
      );

      if (!manipulated.base64) {
        throw new Error('Image encoding failed');
      }

      setIconImage(`data:image/jpeg;base64,${manipulated.base64}`);
    } catch (error) {
      Alert.alert('图片处理失败', error instanceof Error ? error.message : '请换一张图片再试。');
    } finally {
      setProcessingImage(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

      <GlassCard style={styles.form}>
        <Text style={[styles.label, { color: theme.mutedText }]}>名称</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError('');
          }}
          placeholder="例如：每天阅读 20 分钟"
          placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
          style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.text }]}
        />

        <Text style={[styles.label, { color: theme.mutedText }]}>描述</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="记录目标、规则或备注"
          placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
          multiline
          style={[styles.input, styles.textArea, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.text }]}
        />

        {initialTask && isTimerRunning(initialTask) ? (
          <Text style={styles.durationHint}>
            计时中：上方时间段合计会持续增加，总耗时实时相加。
          </Text>
        ) : null}

        <GroupSelect
          label="分组"
          groups={assignableGroups}
          selected={customGroups}
          allLabel="未分组"
          onChange={setCustomGroups}
          onCreateGroup={createFormGroup}
        />

        <Text style={[styles.label, { color: theme.mutedText }]}>图标</Text>
        <View style={styles.customIconRow}>
          <View style={[styles.customIconPreview, {
            borderColor: `${color}66`,
            backgroundColor: theme.inputBackground,
          }]}>
            {iconImage ? (
              <Image source={{ uri: iconImage }} style={styles.customIconImage} contentFit="cover" />
            ) : (
              <MaterialCommunityIcons name={icon as any} size={26} color={color} />
            )}
          </View>
          <PressableScale
            style={[styles.uploadButton, {
              borderColor: `${color}55`,
              backgroundColor: theme.inputBackground,
            }]}
            onPress={() => void pickCustomIcon()}
            disabled={processingImage}
          >
            <MaterialCommunityIcons name="image-plus" size={18} color={color} />
            <Text style={[styles.uploadText, { color }]}>
              {processingImage ? '处理中...' : '上传图片 · 1:1裁剪'}
            </Text>
          </PressableScale>
          {iconImage && (
            <PressableScale
              style={styles.clearImage}
              onPress={() => setIconImage(null)}
              accessibilityLabel="使用内置图标"
            >
              <MaterialCommunityIcons name="close" size={15} color={theme.subtleText} />
            </PressableScale>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.choiceGrid}
        >
          {taskIcons.map((item) => (
            <PressableScale
              key={item}
              onPress={() => {
                setIcon(item);
                setIconImage(null);
              }}
              style={[styles.iconChoice, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }, icon === item && { borderColor: color, backgroundColor: `${color}26` }]}
            >
              <MaterialCommunityIcons
                name={item as any}
                size={22}
                color={icon === item ? color : theme.subtleText}
              />
            </PressableScale>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: theme.mutedText }]}>颜色</Text>
        <View style={styles.colorGrid}>
          {taskColors.map((item) => (
            <PressableScale
              key={item}
              onPress={() => setColor(item)}
              style={[
                styles.colorChoice,
                { backgroundColor: item },
                color === item && [styles.selectedColor, { borderColor: theme.text }],
              ]}
            />
          ))}
        </View>

        {error ? (
          <Text style={[styles.error, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>
            {error}
          </Text>
        ) : null}

        <PressableScale
          style={[styles.submitButton, { backgroundColor: theme.accent }]}
          onPress={save}
        >
          <Text style={[styles.submitText, { color: theme.onAccent }]}>{submitLabel}</Text>
        </PressableScale>
      </GlassCard>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 18,
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  form: {
    gap: 14,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(2,6,23,0.35)',
    borderRadius: 16,
    color: '#f8fafc',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  durationHint: {
    marginTop: 7,
    color: '#94a3b8',
    fontSize: 12,
  },
  customIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customIconPreview: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customIconImage: {
    width: '100%',
    height: '100%',
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  uploadText: {
    fontSize: 12,
    fontWeight: '700',
  },
  clearImage: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  choiceGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  iconChoice: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorChoice: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: 'white',
  },
  error: {
    color: '#fca5a5',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
    shadowColor: '#22d3ee',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  submitText: {
    color: '#04121a',
    fontSize: 16,
    fontWeight: '800',
  },
});

