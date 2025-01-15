// server/rag/AIAvatarService.ts

import { Index, Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { Document } from "langchain/document";
import { PineconeStore } from "@langchain/pinecone";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { BaseMessage } from "@langchain/core/messages";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createRetrievalChain } from "langchain/chains/retrieval";

//
// 1) Domain Types
//
export interface Message {
  id: number;
  userId?: number; // messages table
  fromUserId?: number; // direct_messages table
  toUserId?: number; // if relevant
  content: string;
  createdAt: Date;
  channelId?: number; // messages table
}

export interface AvatarConfig {
  userId: number;
  personalityTraits: string[];
  responseStyle: string;
  writingStyle: string;
  contextWindow: number;
}

//
// 2) AIAvatarService
//
export class AIAvatarService {
  private pineconeClient: PineconeClient;
  private embeddings: OpenAIEmbeddings;
  private llm: ChatOpenAI;
  private indexName = "chat-genius-index";
  private index: Index;
  private vectorStore: PineconeStore | null;

  constructor() {
    // Initialize Pinecone + embeddings + LLM
    this.pineconeClient = new PineconeClient({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large", // match your dimension
      dimensions: 3072,
    });
    this.llm = new ChatOpenAI({
      temperature: 0.7,
      modelName: "gpt-4o-mini", // example model
    });

    this.index = this.pineconeClient.Index(this.indexName);
    this.vectorStore = null;
  }

  /**
   * Must be called once before indexing/searching.
   */
  async initialize() {
    // Loads an existing Pinecone index into a PineconeStore
    this.vectorStore = await PineconeStore.fromExistingIndex(this.embeddings, {
      pineconeIndex: this.index,
    });
  }

  /**
   * Index (upsert) a single message into Pinecone
   */
  async indexUserMessage(message: Message): Promise<void> {
    // Distinguish channel vs DM
    const isChannelMsg = message.channelId !== undefined;
    const docId = isChannelMsg ? `msg_${message.id}` : `dm_${message.id}`;
    const pageContent = isChannelMsg
      ? `[User ${message.userId}] ${message.content}`
      : `[User ${message.fromUserId}] ${message.content}`;

    const doc = new Document({
      id: docId,
      pageContent,
      metadata: {
        userId: isChannelMsg
          ? message.userId?.toString()
          : message.fromUserId?.toString(),
        timestamp: Math.floor(message.createdAt.getTime() / 1000),
        channelId: isChannelMsg
          ? message.channelId?.toString()
          : this._dmKey(message.fromUserId!, message.toUserId),
      },
    });

    await this.vectorStore!.addDocuments([doc], [docId]);
  }

  /**
   * Index (upsert) multiple messages into Pinecone
   */
  async indexUserMessages(messages: Message[]): Promise<void> {
    const docs: Document[] = [];
    const ids: string[] = [];

    for (const msg of messages) {
      const isChannelMsg = msg.channelId !== undefined;
      const docId = isChannelMsg ? `msg_${msg.id}` : `dm_${msg.id}`;
      const pageContent = isChannelMsg
        ? `[User ${msg.userId}] ${msg.content}`
        : `[User ${msg.fromUserId}] ${msg.content}`;

      docs.push(
        new Document({
          id: docId,
          pageContent,
          metadata: {
            userId: isChannelMsg
              ? msg.userId?.toString()
              : msg.fromUserId?.toString(),
            timestamp: Math.floor(msg.createdAt.getTime() / 1000),
            channelId: isChannelMsg
              ? msg.channelId?.toString()
              : this._dmKey(msg.fromUserId!, msg.toUserId),
          },
        }),
      );
      ids.push(docId);
    }

    await this.vectorStore!.addDocuments(docs, ids);
  }

  /**
   * Creates a “persona” (AvatarConfig) by analyzing user’s past messages
   */
  async createAvatarPersona(userId: number): Promise<AvatarConfig> {
    // 1. Retrieve up to 100 docs with metadata.userId == userId
    const userMessages = await this.vectorStore!.similaritySearch("", 100, {
      userId: { $eq: userId.toString() },
    });

    // 2. Analyze messages to create persona
    const prompt = `
    Analyze these messages and create a detailed persona description:
      ${userMessages.map((msg) => msg.pageContent).join("\n")}

      Focus on:
      1. Communication style
      2. Typical responses
      3. Common phrases
      4. Tone and sentiment
      5. Knowledge areas
      6. Writing style

      The goal of this persona creation is to help the AI generate a unique and personalized response in the voice of the user. Writing style should include grammar, punctuation, and style.

      Output should be a JSON object with the following format:
      {
        "personalityTraits": ["personalityTrait1", "personalityTrait2", ...],
        "responseStyle": "responseStyle",
        "writingStyle": "writingStyle",
      }
    `;

    // Use the LLM to produce the persona in JSON format
    const personaLlm = this.llm.bind({
      response_format: { type: "json_object" },
    });
    const response = await personaLlm.invoke(prompt);
    const content =
      typeof response.content === "string"
        ? JSON.parse(response.content)
        : response.content;
    console.log("Persona creation result:", content);

    // Return a typed AvatarConfig
    return {
      userId,
      contextWindow: 100,
      personalityTraits: content.personalityTraits || [],
      responseStyle: content.responseStyle || "casual",
      writingStyle: content.writingStyle || "concise",
    };
  }

  /**
   * Store or upsert the newly created avatar persona in Pinecone
   */
  async configureAvatar(config: AvatarConfig): Promise<void> {
    const configJSON = JSON.stringify(config);
    const embeddedConfig = await this.embeddings.embedQuery(configJSON);
    await this.index.upsert([
      {
        id: `avatar-config-${config.userId}`,
        values: embeddedConfig,
        metadata: {
          type: "avatar-config",
          userId: config.userId.toString(),
          config: configJSON,
        },
      },
    ]);
  }

  /**
   * Generate a response “in the user’s voice/persona” to some new incoming message
   */
  async generateAvatarResponse(
    userId: number,
    message: Message,
  ): Promise<string> {
    // 1. Retrieve avatar config from Pinecone
    let configDocs = await this.vectorStore!.similaritySearch(
      `avatar-config-${userId}`,
      1,
      { type: "avatar-config", userId: { $eq: userId.toString() } },
    );

    if (configDocs.length === 0) {
      // Persona not created yet, let's create it
      const persona = await this.createAvatarPersona(userId);
      await this.configureAvatar(persona);
      // Re-query
      configDocs = await this.vectorStore!.similaritySearch(
        `avatar-config-${userId}`,
        1,
        { type: "avatar-config", userId: { $eq: userId.toString() } },
      );
    }

    const avatarConfig: AvatarConfig = JSON.parse(
      configDocs[0].metadata.config,
    );

    // 2. Build a retriever for the relevant conversation context
    //    For example, only last 48 hours of messages in this channel (or DM).
    const fortyEightHoursAgo =
      Math.floor(message.createdAt.getTime() / 1000) - 248 * 3600;
    const channelKey =
      message.channelId !== undefined
        ? message.channelId.toString()
        : this._dmKey(message.fromUserId!, message.toUserId);

    const retriever = this.vectorStore!.asRetriever({
      filter: {
        timestamp: { $gt: fortyEightHoursAgo },
        channelId: { $eq: channelKey },
      },
      k: avatarConfig.contextWindow,
    });

    // 3. Construct the “contextualize question” prompt
    const contextualizeQSystemPrompt = `
Given a chat history and the latest user question,
which might reference context in the chat history,
formulate a standalone question that can be understood
without the chat history. Do NOT answer, just reformulate if needed and otherwise return it as is.
`;
    const contextualizeQPrompt = ChatPromptTemplate.fromMessages([
      ["system", contextualizeQSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);
    const historyAwareRetriever = await createHistoryAwareRetriever({
      llm: this.llm,
      retriever,
      rephrasePrompt: contextualizeQPrompt,
    });

    // 4. Build the final “answer the question” prompt
    const qaSystemPrompt = `
You are acting as [User ${userId}]'s AI avatar.
Personality traits: ${avatarConfig.personalityTraits.join(", ")}
Response style: ${avatarConfig.responseStyle}
Writing style: ${avatarConfig.writingStyle}

Generate a response that matches their communication style and persona.
{context}
`;
    const qaPrompt = ChatPromptTemplate.fromMessages([
      ["system", qaSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);

    // 5. Combine the retrieval chain
    const questionAnswerChain = await createStuffDocumentsChain({
      llm: this.llm,
      prompt: qaPrompt,
    });

    const ragChain = await createRetrievalChain({
      retriever: historyAwareRetriever,
      combineDocsChain: questionAnswerChain,
    });

    // 6. Provide an empty chat_history (or your last messages)
    const chat_history: BaseMessage[] = [];
    const response = await ragChain.invoke({
      chat_history,
      input: message.content,
    });
    return response.answer;
  }

  /**
   * Helper to unify fromUserId/toUserId into a single string key for DM channels
   */
  private _dmKey(from: number, to?: number): string {
    if (!to) return `dm_${from}`;
    return from > to ? `dm_${to}_${from}` : `dm_${from}_${to}`;
  }
}
