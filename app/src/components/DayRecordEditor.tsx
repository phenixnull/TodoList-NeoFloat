import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, ImageStyle, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import GlassCard from './GlassCard';
import PressableScale from './PressableScale';
import { DayRecord, DayRecordImage } from '../domain/types';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';
import {
  prepareDayRecordImage,
} from '../services/dayRecordFiles';

type Props = {
  taskId: string;
  date: string;
  record?: DayRecord;
  accentColor: string;
  title?: string;
  onSave: (
    taskId: string,
    date: string,
    note: string,
    images?: DayRecordImage[],
  ) => void;
};

const maxImages = 12;

function initialImages(record?: DayRecord): DayRecordImage[] {
  if (Array.isArray(record?.images)) return record.images;
  return record?.image ? [record.image] : [];
}

export default function DayRecordEditor({
  taskId,
  date,
  record,
  accentColor,
  title = '今日打卡记录',
  onSave,
}: Props) {
  const [note, setNote] = useState(record?.note ?? '');
  const [images, setImages] = useState<DayRecordImage[]>(initialImages(record));
  const [processing, setProcessing] = useState(false);
  const [saved, setSaved] = useState(false);
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  const addImages = async () => {
    setProcessing(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('无法访问图片', '请在系统设置中允许 HabitPulse 访问照片。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: maxImages - images.length,
        quality: 0.88,
        orderedSelection: true,
      });

      if (result.canceled || result.assets.length === 0) return;

      const prepared: DayRecordImage[] = [];

      for (const asset of result.assets) {
        prepared.push(await prepareDayRecordImage(
          taskId,
          date,
          asset.uri,
          Number(asset.width ?? 0),
          Number(asset.height ?? 0),
        ));
      }

      setImages((current) => [...current, ...prepared].slice(0, maxImages));
      setSaved(false);
    } catch (error) {
      Alert.alert('图片处理失败', error instanceof Error ? error.message : '请换一张图片再试。');
    } finally {
      setProcessing(false);
    }
  };

  const removeImage = (image: DayRecordImage) => {
    setImages((current) => current.filter((item) => item !== image));
    setSaved(false);
  };

  const save = () => {
    onSave(taskId, date, note, images);
    setSaved(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.date, { color: theme.subtleText }]}>{date}</Text>
      </View>

      <Text style={[styles.label, { color: theme.mutedText }]}>当天描述</Text>
      <TextInput
        value={note}
        onChangeText={(value) => {
          setNote(value);
          setSaved(false);
        }}
        placeholder="记录今天做了什么、感受或成果"
        placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
        multiline
        style={[styles.input, styles.textArea, {
          backgroundColor: theme.inputBackground,
          borderColor: theme.inputBorder,
          color: theme.text,
        }]}
      />

      {images.length > 0 ? (
        <View style={styles.imageGrid}>
          {images.map((image, index) => (
            <View
              key={`${image.fileName}-${index}`}
              style={[styles.imageItem, { borderColor: theme.surfaceBorder }]}
            >
              <Image
                source={image.localUri ? { uri: image.localUri } : require('../../assets/images/icon.png')}
                style={styles.image as ImageStyle}
                contentFit="cover"
                transition={140}
                recyclingKey={`${image.fileName}-${index}`}
              />
              {!image.localUri && (
                <View style={styles.remoteBadge}>
                  <Text style={styles.remoteText}>待下载</Text>
                </View>
              )}
              <Pressable
                accessibilityLabel={`移除第${index + 1}张图片`}
                style={styles.removeBadge}
                onPress={() => removeImage(image)}
              >
                <MaterialCommunityIcons name="close" size={14} color="#020617" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <PressableScale
          style={[styles.empty, {
            borderColor: theme.surfaceBorder,
            backgroundColor: theme.inputBackground,
          }]}
          onPress={() => void addImages()}
          disabled={processing}
        >
          <MaterialCommunityIcons
            name="image-multiple-outline"
            size={26}
            color={theme.accentText}
          />
          <Text style={[styles.emptyText, { color: theme.subtleText }]}>
            {processing ? '正在处理...' : '添加图片 · 最多 12 张'}
          </Text>
        </PressableScale>
      )}

      <View style={styles.buttonRow}>
        <PressableScale
          style={[styles.imageButton, {
            borderColor: `${accentColor}55`,
            backgroundColor: theme.inputBackground,
          }]}
          onPress={() => void addImages()}
          disabled={processing || images.length >= maxImages}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={17} color={accentColor} />
            <Text style={[styles.imageButtonText, { color: accentColor }]}>
            {processing ? '处理中...' : images.length ? '继续添加' : '上传图片'}
          </Text>
        </PressableScale>

        {images.length > 0 && (
          <PressableScale
            style={[styles.clearButton, {
              borderColor: theme.isLight ? 'rgba(185,28,28,0.20)' : 'rgba(252,165,165,0.22)',
              backgroundColor: theme.isLight ? 'rgba(220,38,38,0.08)' : 'rgba(248,113,113,0.10)',
            }]}
            onPress={() => {
              setImages([]);
              setSaved(false);
            }}
            accessibilityLabel="清空今日图片"
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.isLight ? '#b91c1c' : '#fca5a5'} />
            <Text style={[styles.clearText, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>
              清空
            </Text>
          </PressableScale>
        )}
      </View>

      <PressableScale
        style={[styles.saveButton, { backgroundColor: theme.accent }]}
        onPress={save}
      >
        <Text style={[styles.saveText, { color: theme.onAccent }]}>保存今日记录</Text>
      </PressableScale>

      {saved && (
        <Text style={[styles.savedText, { color: theme.accentText }]}>
          已保存，{images.length} 张图片会随同步上传
        </Text>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 13 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  date: {
    color: 'rgba(148,163,184,0.72)',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(2,6,23,0.35)',
    color: '#f8fafc',
    fontSize: 14,
    paddingHorizontal: 15,
  },
  textArea: {
    minHeight: 94,
    paddingTop: 14,
    lineHeight: 21,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  imageItem: {
    flexBasis: '30.5%',
    aspectRatio: 1,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  image: { width: '100%', height: '100%' },
  remoteBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(2,6,23,0.72)',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  remoteText: {
    color: '#e2e8f0',
    fontSize: 9,
    fontWeight: '800',
  },
  removeBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  empty: {
    minHeight: 106,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(148,163,184,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(148,163,184,0.05)',
  },
  emptyText: {
    color: 'rgba(148,163,184,0.78)',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  imageButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(148,163,184,0.07)',
  },
  imageButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  clearButton: {
    minWidth: 82,
    minHeight: 44,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
  },
  clearText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '800',
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 17,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#020617',
    fontWeight: '900',
  },
  savedText: {
    color: '#67e8f9',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '700',
  },
});
