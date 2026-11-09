import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '../context/LanguageContext';
import { colors } from '../theme';

export function PhotoCapture({
  visible,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
}) {
  const { t } = useLanguage();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!photo?.uri) return;
      const processed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
      );
      onCaptured(processed.uri);
      onClose();
    } catch {
      // The camera can reject if the view unmounts mid-capture; nothing to persist.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission?.granted ? (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <SafeAreaView edges={['top', 'bottom']} style={styles.overlay} pointerEvents="box-none">
              <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10}>
                <X color="#fff" size={22} />
              </Pressable>
              <View style={styles.shutterRow}>
                <Pressable onPress={takePhoto} disabled={busy} style={styles.shutter}>
                  {busy ? <ActivityIndicator color={colors.leaf700} /> : <Camera color={colors.leaf700} size={26} />}
                </Pressable>
              </View>
            </SafeAreaView>
          </>
        ) : (
          <SafeAreaView style={styles.permissionBox}>
            <Text style={styles.permissionTitle}>{t('animals.camera_denied')}</Text>
            <Pressable onPress={requestPermission} style={styles.permissionButton}>
              <Text style={styles.permissionButtonText}>{t('common.grant')}</Text>
            </Pressable>
            <Pressable onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  closeButton: {
    alignSelf: 'flex-end',
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRow: { alignItems: 'center', paddingBottom: 24 },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 16,
    backgroundColor: colors.background,
  },
  permissionTitle: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 22 },
  permissionButton: {
    backgroundColor: colors.leaf700,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: { color: '#fff', fontWeight: '700' },
  cancelText: { color: colors.muted, fontSize: 13 },
});
