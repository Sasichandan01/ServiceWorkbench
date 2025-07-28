# CAP Workbench Web Application

This is the web frontend for the CAP Workbench application, built with React, TypeScript, and Vite.

## Features

- AI-powered solution generation
- Real-time chat with AI agents
- Code editor with syntax highlighting
- WebSocket-based communication
- Role-based access control

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# WebSocket URL for real-time chat communication
VITE_WEBSOCKET_URL=wss://your-api-gateway-url.execute-api.region.amazonaws.com/stage

# Other environment variables as needed
VITE_API_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com/stage
```

### WebSocket Configuration

The application uses WebSocket connections for real-time chat functionality. Make sure to:

1. Set the `VITE_WEBSOCKET_URL` environment variable to your WebSocket endpoint
2. Ensure your WebSocket endpoint accepts authentication tokens
3. The WebSocket URL should be in the format: `wss://your-api-gateway-url.execute-api.region.amazonaws.com/stage`

### Troubleshooting WebSocket Issues

If you encounter "Cannot send: input empty, wsClientRef" errors:

1. **Check Environment Variables**: Ensure `VITE_WEBSOCKET_URL` is properly set
2. **Authentication**: Verify that the access token is available in localStorage
3. **Network**: Check if the WebSocket endpoint is accessible from your network
4. **CORS**: Ensure your WebSocket endpoint allows connections from your domain

## Development

### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, or bun package manager

### Installation

```bash
# Using npm
npm install

# Using yarn
yarn install

# Using bun
bun install
```

### Running the Development Server

```bash
# Using npm
npm run dev

# Using yarn
yarn dev

# Using bun
bun dev
```

The application will be available at `http://localhost:5173`

### Building for Production

```bash
# Using npm
npm run build

# Using yarn
yarn build

# Using bun
bun run build
```

## Project Structure

```
src/
├── components/          # Reusable UI components
├── pages/              # Page components
├── services/           # API service functions
├── lib/                # Utility libraries
├── hooks/              # Custom React hooks
├── store/              # State management
└── types/              # TypeScript type definitions
```

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **WebSocket** - Real-time communication
