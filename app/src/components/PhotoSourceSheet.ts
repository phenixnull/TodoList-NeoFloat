import * as ImagePicker from 'expo-image-picker';
import { dialog } from './dialog/dialogs';

export type PhotoSource = 'camera' | 'library';

// Every image upload point routes through here so users can always shoot
// with the camera or pick from the gallery.
export function showPhotoSourceSheet(onPick: (source: PhotoSource) => void) {
  dialog.sheet({
    title: '添加图片',
    options: [
      { text: '拍照', icon: 'camera-outline', onPress: () => onPick('camera') },
      { text: '从相册选择', icon: 'image-outline', onPress: () => onPick('library') },
    ],
    cancelText: '取消',
  });
}

export async function launchPhotoPicker(
  source: PhotoSource,
  options: {
    allowsMultipleSelection?: boolean;
    selectionLimit?: number;
    quality?: number;
    allowsEditing?: boolean;
  } = {},
): Promise<ImagePicker.ImagePickerResult> {
  if (source === 'camera') {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      return { canceled: true, assets: [] } as unknown as ImagePicker.ImagePickerResult;
    }
    return ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: options.quality ?? 0.85,
      allowsEditing: options.allowsEditing ?? false,
    });
  }

  const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!libraryPermission.granted) {
    return { canceled: true, assets: [] } as unknown as ImagePicker.ImagePickerResult;
  }
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: options.quality ?? 0.85,
    allowsEditing: options.allowsEditing ?? false,
    allowsMultipleSelection: options.allowsMultipleSelection ?? false,
    selectionLimit: options.selectionLimit,
    exif: false,
  });
}
