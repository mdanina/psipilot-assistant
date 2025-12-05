# PsiPilot Assistant

AI-powered clinical documentation assistant for mental health professionals.

## Features

- Audio recording and transcription of therapy sessions
- AI-generated clinical notes with customizable templates
- Patient management
- Secure multi-tenant architecture

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **UI**: shadcn/ui, Tailwind CSS
- **Backend**: Supabase (self-hosted)
- **State**: TanStack Query, React Hook Form

## Getting Started

### Prerequisites

- Node.js 18+ & npm
- Self-hosted Supabase instance

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd psipilot-assistant

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure your Supabase credentials in .env.local
# VITE_SUPABASE_URL=http://your-supabase-url
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Start development server
npm run dev
```

### Database Setup

See [supabase/README.md](./supabase/README.md) for database migration instructions.

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Project Structure

```
src/
├── components/     # React components
│   ├── ui/         # shadcn/ui components
│   ├── layout/     # Layout components
│   └── scribe/     # Recording components
├── pages/          # Page components
├── hooks/          # Custom React hooks
├── lib/            # Utilities and Supabase client
└── types/          # TypeScript types
supabase/
└── migrations/     # SQL migrations
```

## License

Private - All rights reserved.
