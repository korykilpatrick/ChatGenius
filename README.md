# ChatGenius - AI-Enhanced Chat Learning Project

ChatGenius is a 2-week sprint project focused on exploring AI-assisted development using Replit and Cursor agents. The goal was to build a Slack-like team communication platform while learning how to effectively integrate AI capabilities and modern development tools.

This project serves as a practical workshop for understanding how to rapidly prototype a full-stack application with AI assistance. While not intended for production use, it implements a comprehensive set of features to demonstrate the capabilities of AI-enhanced development workflows.

## 🌟 Current Features

### Messaging & Communication
- Real-time messaging using WebSocket
- Channel-based communication
- Direct messaging with private conversations
- Message threading and replies
- Voice messages support
- File sharing with secure upload system
  - Support for images, PDFs, docs, and text files
  - 5MB file size limit with type verification
- Message reactions with emojis
  - Real-time reaction updates
  - Support for both channels and DMs

### AI & Voice Features
- AI-powered message responses
  - Context-aware user personas
  - Dynamic conversation context windows
  - Thread-aware message processing
  - Personalized response styles
- Voice capabilities
  - Text-to-speech synthesis
  - Voice cloning from audio samples
  - Custom voice configuration
  - Voice messages in both channels and DMs

### User Management
- User authentication system
- User profiles with avatars
- User search functionality
- Online presence tracking
- User status updates
- AI response preferences configuration

### Channels
- Public and private channels
- Channel membership management
- Real-time channel updates
- Message history
- Message reactions

### Direct Messages
- Private conversations
- Real-time message delivery
- Message threading in DMs
- File sharing in DMs
- Voice messages in DMs
- Message reactions in DMs

### Security Features
- Secure session management
- Protected file uploads with type checking
- Rate limiting
- Authentication middleware
- Secure WebSocket connections

## 🚀 Technical Stack

### Frontend
- React with Vite
- TypeScript for type safety
- TailwindCSS with shadcn/ui for modern, responsive design
- Tanstack Query for efficient data fetching
- WebSocket for real-time updates

### Backend
- Express.js with TypeScript
- PostgreSQL database with Drizzle ORM
- WebSocket server for real-time communication
- Session management with express-session
- Multer for file upload handling

### AI & Voice Technology
- RAG (Retrieval Augmented Generation) system
- Pinecone for vector similarity search
- ElevenLabs integration for voice synthesis
- OpenAI for intelligent features
- Custom context-aware response generation

## 🛠 Development Setup

1. Install dependencies:
```bash
npm install
```

2. The application requires a PostgreSQL database. The connection details will be automatically configured when running on Replit.

3. Start the development server:
```bash
npm run dev
```

## 📱 API Routes

### Authentication
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/logout`

### Users
- GET `/api/users` - List all users
- GET `/api/users/_search` - Search users
- GET `/api/users/:id` - Get user profile
- PUT `/api/user/profile` - Update user profile
- POST `/api/user/avatar` - Update user avatar

### Direct Messages
- GET `/api/dm/conversations` - List DM conversations
- GET `/api/dm/conversations/:userId` - Get/create DM conversation
- GET `/api/dm/conversations/:conversationId/messages` - Get conversation messages
- GET `/api/dm/conversations/:conversationId/messages/:messageId/replies` - Get message replies

### Channels
- GET `/api/channels` - List channels
- POST `/api/channels` - Create channel
- GET `/api/channels/:channelId/messages` - Get channel messages
- GET `/api/channels/:channelId/messages/:messageId/replies` - Get message replies

### Files
- POST `/api/upload` - Upload files (images, PDFs, docs)
- GET `/uploads/*` - Access uploaded files

### System
- GET `/api/health` - System health check
- GET `/api/health/db` - Database connection check

## 🔒 Security Implementation

This project implements basic security practices for learning purposes:
- Secure session management
- Input validation
- Protected file uploads
- Rate limiting
- Authentication middleware
- WebSocket security

## 📄 License

MIT License

## 🤝 Contributing

As this is a learning project, feel free to experiment and build upon it:

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

This project was created as a learning exercise to explore AI-assisted development. While it implements many features, it's designed for educational purposes rather than production use. Feel free to use it as a starting point for your own experiments with AI-enhanced development!