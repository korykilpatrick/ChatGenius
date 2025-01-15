// server/rag/embeddings.ts
import { Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// This function will embed a single piece of text using OpenAI.
export async function embedText(text: string): Promise<number[]> {
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002", // or 'text-embedding-3-large' to match your Python example
    input: text,
  });

  const [{ embedding }] = response.data.data;
  return embedding;
}
touch 