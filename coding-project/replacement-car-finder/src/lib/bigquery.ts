import { BigQuery } from "@google-cloud/bigquery";

let client: BigQuery | null = null;

export function getBigQueryClient(): BigQuery {
  if (!client) {
    client = new BigQuery({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "socar-data",
    });
  }
  return client;
}
