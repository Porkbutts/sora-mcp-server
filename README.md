# Sora MCP Server

An MCP (Model Context Protocol) server for OpenAI's Sora video generation API. This server allows AI assistants to generate, manage, and download AI-generated videos using OpenAI's Sora models.

## Features

- **Create videos** from text prompts using Sora-2 or Sora-2-Pro models
- **Image-to-video** generation using reference images
- **Remix existing videos** with targeted modifications
- **Monitor video generation** progress
- **Download completed videos**, thumbnails, and spritesheets
- **List and manage** your video library

## Prerequisites

- Node.js 18+
- OpenAI API key with Sora access

## Installation

```bash
npm install
npm run build
```

## Configuration

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your-api-key-here
```

## Usage with Claude Code

```bash
claude mcp add-json sora '{
  "command": "node",
  "args": ["/path/to/sora-mcp-server/dist/index.js"],
  "env": {
    "OPENAI_API_KEY": "your-api-key-here"
  }
}'
```

## Available Tools

### create_video

Create a new video from a text prompt.

**Parameters:**
- `prompt` (required): Text description of the video
- `model`: `sora-2` (faster) or `sora-2-pro` (higher quality)
- `size`: Resolution (`1920x1080`, `1080x1920`, `1280x720`, `720x1280`, `1024x1024`)
- `seconds`: Duration (5, 10, 15, or 20)

**Example:**
```
Create a video of a cat playing piano on stage
```

### create_video_with_image

Create a video using an image as the first frame.

**Parameters:**
- `prompt` (required): Description of the motion/action
- `image_url`: URL of the reference image
- `image_base64`: Base64-encoded image (alternative to URL)
- `model`, `size`, `seconds`: Same as create_video

### get_video_status

Check the status of a video generation job.

**Parameters:**
- `video_id` (required): The video job ID

### download_video

Get download URL for a completed video.

**Parameters:**
- `video_id` (required): The video job ID
- `variant`: `video` (MP4), `thumbnail`, or `spritesheet`

### list_videos

List all your video generation jobs.

**Parameters:**
- `limit`: Number of results (1-100)
- `order`: `asc` or `desc`
- `after`: Pagination cursor

### delete_video

Delete a video from OpenAI's storage.

**Parameters:**
- `video_id` (required): The video job ID

### remix_video

Create a variation of an existing video.

**Parameters:**
- `video_id` (required): The completed video to remix
- `prompt` (required): Description of changes to apply

### wait_for_video

Poll until a video completes or fails.

**Parameters:**
- `video_id` (required): The video job ID
- `poll_interval_seconds`: Time between checks (default: 10)
- `timeout_seconds`: Maximum wait time (default: 600)

## Prompting Tips

For best results with Sora, describe:
- **Shot type**: Wide shot, close-up, tracking shot
- **Subject**: What/who is in the video
- **Action**: What is happening
- **Setting**: Where it takes place
- **Lighting**: Time of day, mood

Example: "Wide tracking shot of a teal coupe driving through a desert highway, heat ripples visible, hard sun overhead."

## Content Restrictions

The Sora API enforces these restrictions:
- Content must be suitable for audiences under 18
- No copyrighted characters or music
- No real people or public figures
- No human faces in reference images

## Models

| Model | Best For | Speed | Quality |
|-------|----------|-------|---------|
| sora-2 | Prototyping, iteration | Fast | Good |
| sora-2-pro | Production, final output | Slow | Excellent |

## License

MIT
