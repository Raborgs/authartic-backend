import { Injectable, Logger } from '@nestjs/common';
import * as AWS from 'aws-sdk';

@Injectable()
export class DigitalOceanSpacesService {
  private readonly logger = new Logger(DigitalOceanSpacesService.name);
  private s3: AWS.S3;

  constructor() {
    this.s3 = new AWS.S3({
      endpoint: process.env.DO_SPACES_ENDPOINT,
      region: process.env.DO_SPACES_REGION,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET,
      },
    });
  }

  async uploadFile(
    bucket: string,
    key: string,
    body: Buffer | string | ReadableStream,
    contentType: string,
  ): Promise<AWS.S3.ManagedUpload.SendData> {
    const params = {
      Bucket: bucket,
      Key: key,
      Body: body,
      ACL: 'public-read',
      ContentType: contentType,
    };

    try {
      return await this.s3.upload(params).promise();
    } catch (error) {
      this.logger.error('Error uploading file to DigitalOcean Spaces', error);
      throw error;
    }
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    const params = {
      Bucket: bucket,
      Key: key,
    };

    try {
      await this.s3.deleteObject(params).promise();
    } catch (error) {
      this.logger.error('Error deleting file from DigitalOcean Spaces', error);
      throw error;
    }
  }
}
