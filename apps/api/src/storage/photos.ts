import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type PhotoStorage = {
  ensureBucket(): Promise<void>;
  createUpload(input: { key: string; contentType: string; contentLength: number }): Promise<string>;
  exists(key: string): Promise<boolean>;
  readUrl(key: string): Promise<string>;
};

const UPLOAD_SECONDS = 5 * 60;
const READ_SECONDS = 60 * 60;

export function createPhotoStorage(env: NodeJS.ProcessEnv): PhotoStorage | null {
  const endpoint = env.S3_ENDPOINT;

  if (!endpoint) {
    return null;
  }

  const region = env.S3_REGION || "us-east-1";
  const bucket = env.S3_BUCKET || "photos";
  const credentials = {
    accessKeyId: env.S3_ACCESS_KEY || "minio",
    secretAccessKey: env.S3_SECRET_KEY || "minioadmin",
  };
  const internal = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials,
  });
  const signing = new S3Client({
    region,
    endpoint: env.S3_PUBLIC_ENDPOINT || endpoint,
    forcePathStyle: true,
    credentials,
  });

  return {
    async ensureBucket() {
      try {
        await internal.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (error) {
        if (!bucketExists(error)) {
          throw error;
        }
      }

      await internal.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "PUT", "HEAD"],
                AllowedOrigins: ["*"],
                ExposeHeaders: ["ETag"],
              },
            ],
          },
        }),
      );
    },

    createUpload(input) {
      return getSignedUrl(
        signing,
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        }),
        { expiresIn: UPLOAD_SECONDS },
      );
    },

    async exists(key) {
      try {
        await internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

        return true;
      } catch (error) {
        if (isMissingObject(error)) {
          return false;
        }

        throw error;
      }
    },

    readUrl(key) {
      return getSignedUrl(signing, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: READ_SECONDS,
      });
    },
  };
}

function bucketExists(error: unknown): boolean {
  return named(error, "BucketAlreadyOwnedByYou") || named(error, "BucketAlreadyExists");
}

function isMissingObject(error: unknown): boolean {
  if (named(error, "NotFound") || named(error, "NoSuchKey")) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}

function named(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === name;
}
