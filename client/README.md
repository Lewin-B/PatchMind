# PatchMind Client

A modern Next.js application with shadcn/ui components, NextAuth.js authentication, and a beautiful black and light blue theme.

## Features

- 🎨 **Modern UI**: Built with shadcn/ui components and Tailwind CSS
- 🔐 **Authentication**: GitHub OAuth integration with NextAuth.js
- 🌙 **Dark Theme**: Beautiful black and light blue color scheme
- 📱 **Responsive**: Mobile-first design that works on all devices
- ⚡ **Fast**: Built with Next.js 15 and React 19

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- GitHub OAuth App (for authentication)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:
   Create a `.env.local` file in the root directory with the following variables:

```env
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here
```

3. Set up GitHub OAuth App:

   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Create a new OAuth App
   - Set Authorization callback URL to: `http://localhost:3000/api/auth/callback/github`
   - Copy the Client ID and Client Secret to your `.env.local` file

4. Generate a NextAuth secret:

```bash
openssl rand -base64 32
```

5. Run the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── api/auth/[...nextauth]/route.ts  # NextAuth API routes
│   ├── globals.css                      # Global styles and theme
│   ├── layout.tsx                       # Root layout
│   └── page.tsx                         # Landing page
├── auth.ts                              # NextAuth configuration
├── components/
│   └── ui/                              # shadcn/ui components
└── lib/
    └── utils.ts                         # Utility functions
```

## Tech Stack

- **Framework**: Next.js 15
- **UI Library**: shadcn/ui
- **Styling**: Tailwind CSS
- **Authentication**: NextAuth.js
- **Icons**: Lucide React
- **Language**: TypeScript

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Customization

### Theme Colors

The theme colors are defined in `src/app/globals.css`. You can customize the color scheme by modifying the CSS variables:

- `--primary`: Light blue accent color (#0ea5e9)
- `--background`: Black background (#000000)
- `--foreground`: White text (#ffffff)
- `--card`: Dark card background (#111111)

### Adding Components

To add new shadcn/ui components:

```bash
npx shadcn@latest add [component-name]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.
