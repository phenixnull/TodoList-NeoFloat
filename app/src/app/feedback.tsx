import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Platform,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import GlassCard from '@/components/GlassCard';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import { normalizeServerUrl } from '@/services/api';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';

type FeedbackImage = {
  fileName: string;
  width: number;
  height: number;
  mimeType: string;
  localUri: string;
  base64: string;
};

export default function FeedbackScreen() {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('无法访问图片', '请在系统设置中允许 HabitPulse 访问照片。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 6 - images.length,
      quality: 0.82,
    });

    if (result.canceled || !result.assets.length) return;

    for (const asset of result.assets) {
      if (images.length >= 6) break;

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        asset.width > 1600
          ? [{ resize: { width: 1600 } }]
          : [],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!manipulated.base64) continue;

      setImages((current) => [
        ...current,
        {
          fileName: asset.fileName ?? `feedback-${Date.now()}.jpg`,
          width: manipulated.width,
          height: manipulated.height,
          mimeType: 'image/jpeg',
          localUri: manipulated.uri,
          base64: manipulated.base64!,
        },
      ]);
    }
  };

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('请填写问题标题');
      return;
    }

    if (!settings.syncEnabled || !settings.serverUrl.trim()) {
      Alert.alert('未连接服务端', '请先在设置中开启同步并填写服务端地址。');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const base = normalizeServerUrl(settings.serverUrl);
      const response = await fetch(`${base}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          deviceInfo: `${Platform.OS} ${Platform.Version}`,
          appVersion: Constants.expoConfig?.version ?? '',
          images: images.map((img) => ({
            fileName: img.fileName,
            width: img.width,
            height: img.height,
            mimeType: img.mimeType,
            base64: img.base64,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`提交失败 (${response.status})`);
      }

      setMessage('已提交，感谢反馈！');
      setTitle('');
      setDescription('');
      setImages([]);
      setTimeout(() => {}, 2000);
    } catch (error) {
      Alert.alert('提交失败', error instanceof Error ? error.message : '请检查服务端连接。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <MaterialCommunityIcons name="bug-outline" size={22} color="#fbbf24" />
        <Text style={[styles.title, { color: theme.text }]}>问题反馈</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.form}>
          <Text style={[styles.label, { color: theme.mutedText }]}>问题标题</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="简要描述遇到的问题"
            placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
            maxLength={200}
            style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.text }]}
          />

          <Text style={[styles.label, { color: theme.mutedText }]}>详细描述（可选）</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="操作步骤、预期行为、实际行为等"
            placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
            multiline
            maxLength={10000}
            style={[styles.input, styles.textArea, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, color: theme.text }]}
          />

          <Text style={[styles.label, { color: theme.mutedText }]}>截图（可选，最多 6 张）</Text>

          <View style={styles.imageRow}>
            {images.map((img, index) => (
              <Pressable
                key={img.localUri}
                style={styles.imageWrap}
                onLongPress={() => removeImage(index)}
              >
                <Image source={{ uri: img.localUri }} style={styles.imagePreview} />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => removeImage(index)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color="#f87171" />
                </Pressable>
              </Pressable>
            ))}

            {images.length < 6 && (
              <PressableScale
                style={[styles.addImageButton, { borderColor: theme.surfaceBorder, backgroundColor: theme.inputBackground }]}
                onPress={() => void pickImages()}
              >
                <MaterialCommunityIcons name="image-plus" size={22} color={theme.mutedText} />
              </PressableScale>
            )}
          </View>

          {message ? (
            <Text style={[styles.success, { color: '#34d399' }]}>{message}</Text>
          ) : null}

          <PressableScale
            style={[styles.submitButton, { backgroundColor: theme.accent }]}
            onPress={() => void submit()}
            disabled={submitting || !title.trim()}
          >
            <Text style={[styles.submitText, { color: theme.isLight ? '#ffffff' : '#0c1117' }]}>
              {submitting ? '提交中...' : '提交反馈'}
            </Text>
          </PressableScale>
        </GlassCard>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  form: {
    gap: 12,
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageWrap: {
    position: 'relative',
  },
  imagePreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  removeButton: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  addImageButton: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  success: {
    fontSize: 14,
    fontWeight: '700',
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
    opacity: 1,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
