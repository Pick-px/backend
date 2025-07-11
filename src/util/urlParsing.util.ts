import { URL } from 'url';

function extractKeyFromPresignedUrl(presignedUrl: string): string {
  const url = new URL(presignedUrl);
  return url.pathname.slice(1);
}

function constructS3PublicUrl(
  bucket: string,
  region: string,
  key: string
): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export { extractKeyFromPresignedUrl, constructS3PublicUrl };
