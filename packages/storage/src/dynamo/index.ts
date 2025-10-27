import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoOptions extends DynamoDBClientConfig {}

export function createDynamoDocumentClient(options: DynamoOptions = {}): DynamoDBDocumentClient {
  const client = new DynamoDBClient(options);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}

export const TABLE_NAMES = {
  main: process.env.DYNAMODB_TABLE ?? 'Anankor',
};
