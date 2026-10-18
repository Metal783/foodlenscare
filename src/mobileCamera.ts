import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export async function mobilePhoto(album = false): Promise<string> {
  const photo = await Camera.getPhoto({ source: album ? CameraSource.Photos : CameraSource.Camera, resultType: CameraResultType.DataUrl, quality: 88, width: 2000, height: 2000, saveToGallery: false, correctOrientation: true });
  if (!photo.dataUrl) throw new Error('没有取得照片，请重新选择。');
  return photo.dataUrl;
}
