export const API_BASE = 'https://gzgrswe52e.execute-api.ap-south-1.amazonaws.com/dev';

export const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'doc', 'docx', 'ppt', 'pptx', 'pdf', 'txt']);

export function makeUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function randomJoinCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
