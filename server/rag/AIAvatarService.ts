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
import { db } from "../../db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";

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
  fromUsername?: string; // Added for AI context
  toUsername?: string; // Added for AI context
  parentId?: number; // Added for thread support
}

export interface AvatarConfig {
  userId: number;
  personalityTraits: string[];
  responseStyle: string;
  writingStyle: string;
  contextWindow: number;
  messageFrequency?: {
    avgMessagesPerDay: number;
    lastActiveTimestamp: number;
  };
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
      modelName: "gpt-4o", // example model
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
      ? `[${message.fromUsername}] ${message.content}`
      : `[${message.fromUsername}] ${message.content}`;

    const doc = new Document({
      id: docId,
      pageContent,
      metadata: {
        userId: isChannelMsg
          ? message.userId?.toString()
          : message.fromUserId?.toString(),
        username: message.fromUsername,
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
        ? `[${msg.fromUsername}] ${msg.content}`
        : `[${msg.fromUsername}] ${msg.content}`;

      docs.push(
        new Document({
          id: docId,
          pageContent,
          metadata: {
            userId: isChannelMsg
              ? msg.userId?.toString()
              : msg.fromUserId?.toString(),
            username: msg.fromUsername,
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
   * Creates a "persona" (AvatarConfig) by analyzing user's past messages
   */
  async createAvatarPersona(userId: number): Promise<AvatarConfig> {
    // Get user profile data
    const userProfile = await db
      .select({
        title: users.title,
        bio: users.bio,
        username: users.username
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Get user messages
    const userMessages = await this.vectorStore!.similaritySearch("", 100, {
      userId: { $eq: userId.toString() },
    });

    // Include profile context in message analysis
    const profileContext = userProfile[0]?.bio ? `User Profile:\nTitle: ${userProfile[0].title}\nBio: ${userProfile[0].bio}\n\n` : "";

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
   * Calculates optimal context window based on conversation activity
   */
  private async calculateDynamicContextWindow(
    message: Message,
    avatarConfig: AvatarConfig,
    channelKey: string
  ): Promise<{ timeWindow: number; messageLimit: number }> {
    // Get message frequency in this channel
    const oneDayAgo = Math.floor(message.createdAt.getTime() / 1000) - 24 * 3600;
    const recentMessages = await this.vectorStore!.similaritySearch("", 1000, {
      timestamp: { $gt: oneDayAgo },
      channelId: { $eq: channelKey },
    });

    // Calculate activity metrics
    const messageCount = recentMessages.length;
    const messagesPerHour = messageCount / 24;
    
    // Adjust time window based on activity
    let timeWindow = 48 * 3600; // Default 48 hours
    if (messagesPerHour > 50) {
      // High activity channel - shorter but more intense window
      timeWindow = 12 * 3600; // 12 hours for very active channels
    } else if (messagesPerHour > 20) {
      // Medium-high activity
      timeWindow = 24 * 3600; // 24 hours
    } else if (messagesPerHour < 5) {
      // Low activity - extend window to capture more context
      timeWindow = 7 * 24 * 3600; // 7 days
    } else if (messagesPerHour < 1) {
      // Very low activity
      timeWindow = 30 * 24 * 3600; // 30 days
    }

    // Calculate message limit based on activity and user's typical engagement
    let messageLimit = avatarConfig.contextWindow;
    if (avatarConfig.messageFrequency) {
      const userActivity = avatarConfig.messageFrequency.avgMessagesPerDay;
      // Scale context window with user's activity level
      const baseLimit = Math.max(50, Math.min(200, Math.floor(userActivity * 2)));
      
      // Adjust based on channel activity
      if (messagesPerHour > 50) {
        messageLimit = Math.min(baseLimit, 75); // Smaller window for high activity
      } else if (messagesPerHour < 1) {
        messageLimit = Math.max(baseLimit, 150); // Larger window for low activity
      } else {
        messageLimit = baseLimit;
      }
    }

    return { timeWindow, messageLimit };
  }

  /**
   * Retrieves relevant messages using semantic search
   */
  private async getRelevantMessages(
    message: Message,
    timeWindow: number,
    messageLimit: number,
    channelKey: string
  ): Promise<Document[]> {
    const timeAgo = Math.floor(message.createdAt.getTime() / 1000) - timeWindow;

    // Get thread context if message is a reply
    let threadContext: Document[] = [];
    if (message.parentId) {
      const threadMessages = await this.vectorStore!.similaritySearch("", 10, {
        parentId: { $eq: message.parentId.toString() }
      });
      console.log("Thread context messages:", threadMessages);
      threadContext = threadMessages;
    }
    
    // Get recent messages
    const timeBasedMessages = await this.vectorStore!.similaritySearch("", messageLimit, {
      timestamp: { $gt: timeAgo },
      channelId: { $eq: channelKey },
    });
    console.log("Time-based messages:", timeBasedMessages);

    // Get semantically similar messages
    const similarMessages = await this.vectorStore!.similaritySearch(
      message.content || "",
      Math.floor(messageLimit * 0.3),
      {
        channelId: { $eq: channelKey },
      }
    );
    console.log("Semantically similar messages:", similarMessages);

    // Combine all contexts with priority
    const seenIds = new Set<string>();
    const combinedMessages: Document[] = [];
    
    // Add thread context first
    for (const msg of threadContext) {
      const id = msg.id;
      if (typeof id === 'string' && !seenIds.has(id)) {
        seenIds.add(id);
        combinedMessages.push(msg);
      }
    }
    
    // Add time-based messages first
    for (const msg of timeBasedMessages) {
      const id = msg.id;
      if (typeof id === 'string' && !seenIds.has(id)) {
        seenIds.add(id);
        combinedMessages.push(msg);
      }
    }
    
    // Add similar messages if not already included
    for (const msg of similarMessages) {
      const id = msg.id;
      if (typeof id === 'string' && !seenIds.has(id)) {
        seenIds.add(id);
        combinedMessages.push(msg);
      }
    }

    // Sort by timestamp
    return combinedMessages.sort((a, b) => 
      (a.metadata.timestamp as number) - (b.metadata.timestamp as number)
    );
  }

  /**
   * Generate a response "in the user's voice/persona" to some new incoming message
   */
  async generateAvatarResponse(
    aiUserId: number, // The ID of the user whose AI avatar is responding
    message: Message,
  ): Promise<string> {
    // 1. Validate that we have the correct user IDs and usernames
    const messageFromUserId = message.channelId ? message.userId : message.fromUserId;
    const messageToUserId = message.channelId ? undefined : message.toUserId;

    // Type guard to ensure we have the required usernames
    function hasRequiredUsernames(msg: Message): msg is Message & { fromUsername: string; toUsername: string } {
      return Boolean(msg.fromUsername && (!msg.channelId || msg.toUsername));
    }

    if (!messageFromUserId || !hasRequiredUsernames(message)) {
      throw new Error("Invalid message: missing sender information");
    }

    if (!message.channelId && (!messageToUserId || !message.toUsername)) {
      throw new Error("Invalid DM: missing recipient information");
    }

    // For DMs, validate we're responding to the correct person
    if (!message.channelId && messageToUserId !== aiUserId) {
      throw new Error("Invalid DM: AI user is not the recipient");
    }

    // After validation, TypeScript knows these exist
    const fromUsername = message.fromUsername;
    const toUsername = message.toUsername;

    // 1. Retrieve avatar config from Pinecone
    let configDocs = await this.vectorStore!.similaritySearch(
      `avatar-config-${aiUserId}`,
      1,
      { type: "avatar-config", userId: { $eq: aiUserId.toString() } },
    );

    if (configDocs.length === 0) {
      const persona = await this.createAvatarPersona(aiUserId);
      await this.configureAvatar(persona);
      configDocs = await this.vectorStore!.similaritySearch(
        `avatar-config-${aiUserId}`,
        1,
        { type: "avatar-config", userId: { $eq: aiUserId.toString() } },
      );
    }

    const avatarConfig: AvatarConfig = JSON.parse(
      configDocs[0].metadata.config,
    );

    // 2. Calculate dynamic context window and channel key
    if (!message.channelId && (!message.fromUserId || !message.toUserId)) {
      throw new Error("Invalid message: missing both channelId and user IDs");
    }
    
    const channelKey = message.channelId ? 
      message.channelId.toString() : 
      this._dmKey(message.fromUserId!, message.toUserId!);

    const { timeWindow, messageLimit } = await this.calculateDynamicContextWindow(
      message,
      avatarConfig,
      channelKey
    );

    // 3. Use the base retriever with our dynamic window settings
    const retriever = this.vectorStore!.asRetriever({
      filter: {
        timestamp: { 
          $gt: Math.floor(message.createdAt.getTime() / 1000) - timeWindow 
        },
        channelId: { $eq: channelKey },
      },
      k: messageLimit,
    });

    // 4. Construct the "contextualize question" prompt
    const contextualizeQSystemPrompt = `
Given a chat history and the latest message from ${fromUsername},
formulate a standalone message that captures what they are saying.
Do NOT answer or respond, just reformulate their message if needed and otherwise return it as is.
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
    console.log("toUsername", toUsername);
    console.log("fromUsername", fromUsername);
    // 5. Build the final "answer the question" prompt
    const qaSystemPrompt = `
You are roleplaying as ${toUsername}. ${fromUsername} has just said something to you.

IMPORTANT: You ARE ${toUsername}. You are NOT ${fromUsername}. You must respond AS ${toUsername} would respond.

YOUR PERSONALITY & STYLE:
- Core traits: ${avatarConfig.personalityTraits.join(", ")}
- Communication style: ${avatarConfig.responseStyle}
- Writing style: ${avatarConfig.writingStyle}

RESPONSE GUIDELINES:
1. Voice & Identity
   - You ARE ${toUsername} - think and speak exactly as they would
   - Never break character or speak as if you are ${fromUsername}
   - Use ${toUsername}'s typical phrases and expressions
   - Maintain ${toUsername}'s usual level of formality

2. Content Authenticity
   - Respond with ${toUsername}'s actual opinions and viewpoints
   - Keep responses proportional to ${toUsername}'s typical message length
   - Stay within ${toUsername}'s knowledge domains
   - Match ${toUsername}'s emoji/reaction usage patterns
   - Maintain ${toUsername}'s usual tone (professional, casual, etc.)

3. Contextual Awareness
   - Consider the conversation's current topic and tone
   - Acknowledge any referenced messages or threads
   - Maintain ${toUsername}'s typical level of engagement
   - ALWAYS start your response with "@${fromUsername}"

4. Authenticity Rules
   - Never disclose being an AI
   - Avoid generic or templated responses
   - Stay within ${toUsername}'s usual topics and interests
   - Maintain consistent opinions with ${toUsername}'s past messages

{context}

Remember: You ARE ${toUsername} responding to ${fromUsername}. Stay completely in character as ${toUsername}.
Your response MUST start with "@${fromUsername}".

The message you are responding to:
"""
${message.content}
"""

Generate a response that ${toUsername} would give, starting with "@${fromUsername}":
`;
    const qaPrompt = ChatPromptTemplate.fromMessages([
      ["system", qaSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);

    // 6. Combine the retrieval chain
    const questionAnswerChain = await createStuffDocumentsChain({
      llm: this.llm,
      prompt: qaPrompt,
    });

    const ragChain = await createRetrievalChain({
      retriever: historyAwareRetriever,
      combineDocsChain: questionAnswerChain,
    });

    // 7. Provide an empty chat_history (or your last messages)
    const chat_history: BaseMessage[] = [];
    console.log("Invoking RAG chain with context:");
    const response = await ragChain.invoke({
      chat_history,
      input: message.content,
    });
    console.log("RAG chain response:", response);
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
