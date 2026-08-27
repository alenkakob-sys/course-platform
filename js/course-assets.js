import { supabase } from './supabaseClient.js?v=20260827-3';
import { FUNCTIONS_URL } from './config.js?v=20260827-3';

const PART_SIZE = 64 * 1024 * 1024;

async function assetRequest(body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Сесія завершилася. Увійдіть знову.');
  const response = await fetch(`${FUNCTIONS_URL}/r2-course-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Помилка файлового сервісу');
  return result;
}

function uploadPart(uploadUrl, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve(request.getResponseHeader('ETag'));
      else reject(new Error(`R2 upload failed (${request.status})`));
    });
    request.addEventListener('error', () => reject(new Error('Не вдалося завантажити файл. Перевірте інтернет.')));
    request.send(blob);
  });
}

export async function uploadCourseAsset({ courseId, lessonId = null, assetType, file, onProgress }) {
  const initiated = await assetRequest({
    action: 'initiate', courseId, lessonId, assetType,
    fileName: file.name, fileSize: file.size, contentType: file.type || 'application/octet-stream',
  });
  const parts = [];
  try {
    const partCount = Math.ceil(file.size / PART_SIZE);
    for (let index = 0; index < partCount; index += 1) {
      const start = index * PART_SIZE;
      const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));
      const partNumber = index + 1;
      const { uploadUrl } = await assetRequest({
        action: 'sign-part', courseId, lessonId, assetType, uploadId: initiated.uploadId,
        objectKey: initiated.objectKey, partNumber, partSize: blob.size,
      });
      const etag = await uploadPart(uploadUrl, blob, (partProgress) => onProgress?.((start + blob.size * partProgress) / file.size));
      if (!etag) throw new Error('R2 не підтвердив завантажену частину файлу.');
      parts.push({ ETag: etag, PartNumber: partNumber });
    }
    await assetRequest({ action: 'complete', courseId, lessonId, assetType, uploadId: initiated.uploadId, objectKey: initiated.objectKey, parts });
    return { objectKey: initiated.objectKey, fileName: file.name, contentType: file.type || 'application/octet-stream' };
  } catch (error) {
    await assetRequest({ action: 'abort', courseId, lessonId, assetType, uploadId: initiated.uploadId, objectKey: initiated.objectKey }).catch(() => {});
    throw error;
  }
}

export async function getCourseAssetUrl({ courseId, objectKey, fileName, download = false }) {
  const { url } = await assetRequest({ action: 'download', courseId, objectKey, fileName, download });
  return url;
}

export async function openCourseAsset(options) {
  const target = window.open('', '_blank');
  try {
    const url = await getCourseAssetUrl(options);
    if (target) {
      target.opener = null;
      target.location = url;
    } else {
      window.location.href = url;
    }
  } catch (error) {
    target?.close();
    throw error;
  }
}
