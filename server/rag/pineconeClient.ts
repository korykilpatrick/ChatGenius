// server/rag/pineconeClient.ts
import { PineconeClient } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const PINECONE_INDEX = process.env.PINECONE_INDEX || "";

if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !PINECONE_INDEX) {
  throw new Error("Missing Pinecone environment variables");
}

export const pinecone = new PineconeClient();

export async function initPinecone() {
  await pinecone.init({
    apiKey: PINECONE_API_KEY,
    environment: PINECONE_ENVIRONMENT,
  });
  return pinecone;
}
