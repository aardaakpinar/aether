# Aether Bot

A powerful moderation and role management bot built for the Fluxer platform.

## Features

### 🛡️ Moderation Commands
- **!warn** - Issue warnings to users (Helper+)
- **!ban** - Ban users from the server (Helper+)
- **!unban** - Remove bans (Mod+)
- **!kick** - Kick users from the server (Mod+)
- **!tempban** - Temporary bans with automatic removal (Mod+)
- **!softban** - Delete recent messages and unban (Mod+)

### 📣 Message Management
- **!purge** - Delete bulk messages (Mod+)
- **!slowmode** - Enable/disable slowmode on channels (Mod+)
- **!mute** - Mute users for a specified duration (Mod+)

### 🔐 Channel Management
- **!lock** - Lock channels (Mod+)
- **!unlock** - Unlock channels (Mod+)

### 📊 Logging & Records
- **!history** - View user moderation history (Helper+)
- **!case** - View specific case details (Helper+)
- **!modlog** - Configure moderation log channel (Admin+)

### 🎯 Reaction Roles
- **!rr add** - Add emoji-to-role mappings (Admin+)
- **!rr remove** - Remove mappings (Admin+)
- **!rr clear** - Clear all mappings from a message (Admin+)
- **!rr list** - List all reaction role bindings (Admin+)
- **Alias**: `!reactionrole`

### 🎨 Role Menus
- **!rolemenu create** - Create self-assign role menus (Admin+)
- **!rolemenu add** - Add roles to menus (Admin+)
- **!rolemenu config** - Configure menu settings (Admin+)
- **!rolemenu list** - List all menus (Admin+)
- **Alias**: `!rmenu`

### 👤 Role Persistence
- **!rolepersist add** - Save roles to reapply on rejoin (SR Mod+)
- **!rolepersist remove** - Remove persisted roles (SR Mod+)
- **!rolepersist list** - View all persisted roles (SR Mod+)
- **!rolepersist info** - Check user's persisted roles (SR Mod+)
- **Aliases**: `!persistrole`, `!rp`

### ⚙️ Server Configuration
- **!prefix** - View or change server command prefix (Server Owner)
- **!help** - Display command help (All members)

## Installation

### Prerequisites
- Node.js 20.x or higher
- npm

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/aardaakpinar/aether
   cd aether
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env and add your FLUXER_BOT_TOKEN
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## Configuration

### Environment Variables
```env
FLUXER_BOT_TOKEN=your_bot_token_here
```

### Server Settings
- **Command Prefix**: Customize per-server with `!prefix <new_prefix>`
- **Modlog Channel**: Set with `!modlog channel <#channel>`

## Permission Levels

- **Everyone** - Basic commands
- **Helper** - Warning/history commands
- **Mod** (Moderate Members perm) - Moderation commands
- **SR Mod** - Role persistence commands
- **Admin** - Role/reaction management
- **SR Admin** (Administrator perm) - Advanced config
- **Owner** - Bot owner (full access)

## Command Structure

Commands follow a modular architecture:
- `src/commands.mjs` - Command handlers
- `src/ranks.mjs` - Permission system
- `src/db.mjs` - Data storage
- `src/events.mjs` - Discord events
- `src/utils.mjs` - Utility functions

## Development

### Running in development
```bash
npm start
# Bot watches for changes and auto-reloads
```

### Syntax check
```bash
node --check src/index.mjs
```

## Support

For issues, feature requests, or questions, contact the Fluxer moderation team.
