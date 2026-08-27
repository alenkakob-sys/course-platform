import { supabase } from './supabaseClient.js?v=20260827-4';
import { FUNCTIONS_URL } from './config.js?v=20260827-4';

async function authenticatedRequest(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Сесія завершилася. Увійдіть знову.');

  const response = await fetch(`${FUNCTIONS_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Помилка файлового сервісу');
  return result;
}

const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 64 * 1024 * 1024;

function putFile(uploadUrl, file, onProgress, includeContentType = true) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    if (includeContentType) request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve(request.getResponseHeader('ETag'));
      else reject(new Error(`R2 upload failed (${request.status})`));
    });
    request.addEventListener('error', () => reject(new Error('Не вдалося завантажити файл. Перевірте інтернет.')));
    request.addEventListener('abort', () => reject(new Error('Завантаження скасовано.')));
    request.send(file);
  });
}

async function uploadPartWithRetry({ uploadUrl, blob, onProgress }) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const etag = await putFile(uploadUrl, blob, onProgress, false);
      if (!etag) throw new Error('R2 did not return an ETag');
      return etag;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function uploadMultipart({ threadId, file, kind, onProgress }) {
  const initiated = await authenticatedRequest('r2-multipart', {
    action: 'initiate', threadId, kind, fileName: file.name,
    contentType: file.type || 'application/octet-stream', fileSize: file.size,
  });
  const parts = [];

  try {
    const partCount = Math.ceil(file.size / PART_SIZE);
    for (let index = 0; index < partCount; index += 1) {
      const start = index * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const blob = file.slice(start, end);
      const partNumber = index + 1;
      const { uploadUrl } = await authenticatedRequest('r2-multipart', {
        action: 'sign-part', threadId, kind,
        uploadId: initiated.uploadId, objectKey: initiated.objectKey,
        partNumber, partSize: blob.size,
      });
      const etag = await uploadPartWithRetry({
        uploadUrl,
        blob,
        onProgress: (partProgress) => {
          if (onProgress) onProgress((start + (blob.size * partProgress)) / file.size);
        },
      });
      parts.push({ ETag: etag, PartNumber: partNumber });
    }

    await authenticatedRequest('r2-multipart', {
      action: 'complete', threadId, kind,
      uploadId: initiated.uploadId, objectKey: initiated.objectKey, parts,
    });
    return `r2:${initiated.objectKey}`;
  } catch (error) {
    await authenticatedRequest('r2-multipart', {
      action: 'abort', threadId, kind,
      uploadId: initiated.uploadId, objectKey: initiated.objectKey,
    }).catch(() => {});
    throw error;
  }
}

export async function uploadPrivateFile({ threadId, file, kind = 'chat', onProgress }) {
  if (file.size > MULTIPART_THRESHOLD) {
    return uploadMultipart({ threadId, file, kind, onProgress });
  }
  const prepared = await authenticatedRequest('r2-upload-url', {
    threadId,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    fileSize: file.size,
    kind,
  });
  await putFile(prepared.uploadUrl, file, onProgress);
  return `r2:${prepared.objectKey}`;
}

export async function getPrivateFileUrl(messageId, { download = false } = {}) {
  return authenticatedRequest('r2-download-url', { messageId, download });
}

// Підписане посилання живе 5 хвилин. Кешуємо його на цей час, щоб перемикання
// вкладок чату туди-сюди не замовляло нове посилання на кожен показ картинки:
// кожне замовлення — це виклик серверної функції, а вони не безкоштовні.
const previewUrlCache = new Map();

export async function getPrivateFilePreviewUrl(messageId) {
  const cached = previewUrlCache.get(messageId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const { url, expiresIn } = await getPrivateFileUrl(messageId);
  previewUrlCache.set(messageId, { url, expiresAt: Date.now() + ((expiresIn || 300) * 1000) });
  return url;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'ogv'];

// Тип визначаємо за розширенням у назві файлу: у повідомленні чату
// зберігається саме вона, окремого поля з типом у базі немає.
export function attachmentKind(fileName) {
  const extension = String(fileName || '').split('.').pop().toLowerCase();
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  return 'file';
}

export async function openPrivateFile(messageId, { download = false } = {}) {
  const target = window.open('', '_blank');
  try {
    const { url } = await getPrivateFileUrl(messageId, { download });
    if (target) {
      target.opener = null;
      target.location = url;
    } else {
      window.location.href = url;
    }
  } catch (error) {
    if (target) target.close();
    throw error;
  }
}

export function isPrivateFileRef(value) {
  return typeof value === 'string' && value.startsWith('r2:');
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
