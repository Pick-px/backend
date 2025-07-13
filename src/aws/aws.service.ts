import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommandInput,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class AwsService {
  private readonly s3: S3Client;
  private readonly bucket = process.env.AWS_S3_BUCKET;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  // 서버에서 직접 업로드 (예: 그룹 히스토리 저장)
  async uploadFile(
    file: Buffer,
    key: string,
    contentType: string
  ): Promise<void> {
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    };
    await this.s3.send(new PutObjectCommand(params));
  }

  // Pre-signed URL 생성 (예: 사용자 업로드용)
  async generatePresignedUrl(
    key: string,
    contentType: string
  ): Promise<string> {
    const expiresInSeconds = 60;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return await getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteObject(url: string) {
    return await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: url,
      })
    );
  }
}
