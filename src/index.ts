#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Types for Sora API
interface VideoJob {
  id: string;
  object: "video";
  created_at: number;
  status: "queued" | "in_progress" | "completed" | "failed";
  model: string;
  progress?: number;
  seconds?: string;
  size?: string;
  quality?: string;
  error?: {
    message: string;
  };
}

interface VideoListResponse {
  data: VideoJob[];
  object: "list";
  has_more?: boolean;
}

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return apiKey;
}

// Helper function for API requests
async function makeApiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = getApiKey();
  const baseUrl = "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  return response;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "create_video",
    description:
      "Create a new video generation job using OpenAI's Sora model. Returns a job ID that can be used to check status and download the video when complete. Video generation is asynchronous and may take several minutes.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Text description of the video to generate. For best results, describe shot type, subject, action, setting, and lighting. Example: 'Wide shot of a child flying a red kite in a grassy park, golden hour sunlight, camera slowly pans upward.'",
        },
        model: {
          type: "string",
          enum: ["sora-2", "sora-2-pro"],
          description:
            "Model to use. 'sora-2' is faster and good for iteration. 'sora-2-pro' produces higher quality but takes longer.",
          default: "sora-2",
        },
        size: {
          type: "string",
          enum: [
            "1920x1080",
            "1080x1920",
            "1280x720",
            "720x1280",
            "1024x1024",
          ],
          description: "Resolution of the output video. Default is 1280x720.",
          default: "1280x720",
        },
        seconds: {
          type: "number",
          enum: [5, 10, 15, 20],
          description: "Duration of the video in seconds. Default is 5.",
          default: 5,
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "create_video_with_image",
    description:
      "Create a video using an image as the first frame reference. The image guides the visual style and composition of the generated video.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Text description of the action/motion to apply to the reference image.",
        },
        image_url: {
          type: "string",
          description:
            "URL of the reference image to use as the first frame. Must be publicly accessible.",
        },
        image_base64: {
          type: "string",
          description:
            "Base64-encoded image data (alternative to image_url). Include the data URI prefix, e.g., 'data:image/jpeg;base64,...'",
        },
        model: {
          type: "string",
          enum: ["sora-2", "sora-2-pro"],
          description: "Model to use.",
          default: "sora-2",
        },
        size: {
          type: "string",
          enum: [
            "1920x1080",
            "1080x1920",
            "1280x720",
            "720x1280",
            "1024x1024",
          ],
          description:
            "Resolution of the output video. Should match the input image aspect ratio.",
          default: "1280x720",
        },
        seconds: {
          type: "number",
          enum: [5, 10, 15, 20],
          description: "Duration of the video in seconds.",
          default: 5,
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "get_video_status",
    description:
      "Get the current status of a video generation job. Returns progress percentage and status (queued, in_progress, completed, failed).",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "The ID of the video job to check.",
        },
      },
      required: ["video_id"],
    },
  },
  {
    name: "download_video",
    description:
      "Get a download URL for a completed video. The URL is valid for 1 hour. Only works for videos with 'completed' status.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "The ID of the completed video to download.",
        },
        variant: {
          type: "string",
          enum: ["video", "thumbnail", "spritesheet"],
          description:
            "Type of content to download. 'video' for MP4, 'thumbnail' for preview image, 'spritesheet' for frame overview.",
          default: "video",
        },
      },
      required: ["video_id"],
    },
  },
  {
    name: "list_videos",
    description:
      "List all video generation jobs for your account with pagination support.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of videos to return (1-100).",
          default: 20,
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order by creation time.",
          default: "desc",
        },
        after: {
          type: "string",
          description: "Cursor for pagination. Use the ID from a previous response.",
        },
      },
    },
  },
  {
    name: "delete_video",
    description:
      "Delete a video from OpenAI's storage. This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "The ID of the video to delete.",
        },
      },
      required: ["video_id"],
    },
  },
  {
    name: "remix_video",
    description:
      "Create a variation of an existing completed video with targeted adjustments. Preserves the original structure while applying the specified changes. Best for single, well-defined modifications.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "The ID of the completed video to remix.",
        },
        prompt: {
          type: "string",
          description:
            "Description of the change to apply. Make single, focused changes for best results. Example: 'Change the color palette to teal and rust with warm backlight.'",
        },
      },
      required: ["video_id", "prompt"],
    },
  },
  {
    name: "wait_for_video",
    description:
      "Poll a video job until it completes or fails. Returns the final status. Useful for waiting on video generation without manual polling.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "The ID of the video job to wait for.",
        },
        poll_interval_seconds: {
          type: "number",
          description: "Seconds between status checks.",
          default: 10,
        },
        timeout_seconds: {
          type: "number",
          description: "Maximum seconds to wait before timing out.",
          default: 600,
        },
      },
      required: ["video_id"],
    },
  },
];

// Tool handlers
async function handleCreateVideo(args: {
  prompt: string;
  model?: string;
  size?: string;
  seconds?: number;
}): Promise<string> {
  const formData = new FormData();
  formData.append("prompt", args.prompt);
  formData.append("model", args.model || "sora-2");
  formData.append("size", args.size || "1280x720");
  formData.append("seconds", String(args.seconds || 5));

  const response = await makeApiRequest("/videos", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create video: ${response.status} - ${error}`);
  }

  const video: VideoJob = await response.json();
  return JSON.stringify(video, null, 2);
}

async function handleCreateVideoWithImage(args: {
  prompt: string;
  image_url?: string;
  image_base64?: string;
  model?: string;
  size?: string;
  seconds?: number;
}): Promise<string> {
  const formData = new FormData();
  formData.append("prompt", args.prompt);
  formData.append("model", args.model || "sora-2");
  formData.append("size", args.size || "1280x720");
  formData.append("seconds", String(args.seconds || 5));

  if (args.image_url) {
    // Fetch the image and add it to form data
    const imageResponse = await fetch(args.image_url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from URL: ${args.image_url}`);
    }
    const imageBlob = await imageResponse.blob();
    formData.append("input_reference", imageBlob, "reference.jpg");
  } else if (args.image_base64) {
    // Convert base64 to blob
    const matches = args.image_base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid base64 image format. Expected data URI format.");
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const binaryData = Buffer.from(base64Data, "base64");
    const blob = new Blob([binaryData], { type: mimeType });
    const extension = mimeType.split("/")[1] || "jpg";
    formData.append("input_reference", blob, `reference.${extension}`);
  } else {
    throw new Error("Either image_url or image_base64 must be provided");
  }

  const response = await makeApiRequest("/videos", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create video: ${response.status} - ${error}`);
  }

  const video: VideoJob = await response.json();
  return JSON.stringify(video, null, 2);
}

async function handleGetVideoStatus(args: { video_id: string }): Promise<string> {
  const response = await makeApiRequest(`/videos/${args.video_id}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get video status: ${response.status} - ${error}`);
  }

  const video: VideoJob = await response.json();
  return JSON.stringify(video, null, 2);
}

async function handleDownloadVideo(args: {
  video_id: string;
  variant?: string;
}): Promise<string> {
  const variant = args.variant || "video";
  const url = `/videos/${args.video_id}/content?variant=${variant}`;

  // First check if video is completed
  const statusResponse = await makeApiRequest(`/videos/${args.video_id}`);
  if (!statusResponse.ok) {
    const error = await statusResponse.text();
    throw new Error(`Failed to get video status: ${statusResponse.status} - ${error}`);
  }

  const video: VideoJob = await statusResponse.json();
  if (video.status !== "completed") {
    throw new Error(
      `Video is not ready for download. Current status: ${video.status}`
    );
  }

  // Get the download URL (the API returns a redirect or the content)
  const apiKey = getApiKey();
  const downloadUrl = `https://api.openai.com/v1${url}`;

  return JSON.stringify(
    {
      video_id: args.video_id,
      variant: variant,
      download_url: downloadUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      note: "Use this URL with the Authorization header to download the content. URL expires in 1 hour.",
      curl_example: `curl -L "${downloadUrl}" -H "Authorization: Bearer $OPENAI_API_KEY" --output video.mp4`,
    },
    null,
    2
  );
}

async function handleListVideos(args: {
  limit?: number;
  order?: string;
  after?: string;
}): Promise<string> {
  const params = new URLSearchParams();
  if (args.limit) params.append("limit", String(args.limit));
  if (args.order) params.append("order", args.order);
  if (args.after) params.append("after", args.after);

  const queryString = params.toString();
  const url = `/videos${queryString ? `?${queryString}` : ""}`;

  const response = await makeApiRequest(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list videos: ${response.status} - ${error}`);
  }

  const videos: VideoListResponse = await response.json();
  return JSON.stringify(videos, null, 2);
}

async function handleDeleteVideo(args: { video_id: string }): Promise<string> {
  const response = await makeApiRequest(`/videos/${args.video_id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete video: ${response.status} - ${error}`);
  }

  return JSON.stringify(
    {
      success: true,
      video_id: args.video_id,
      message: "Video deleted successfully",
    },
    null,
    2
  );
}

async function handleRemixVideo(args: {
  video_id: string;
  prompt: string;
}): Promise<string> {
  const response = await makeApiRequest(`/videos/${args.video_id}/remix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: args.prompt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to remix video: ${response.status} - ${error}`);
  }

  const video: VideoJob = await response.json();
  return JSON.stringify(video, null, 2);
}

async function handleWaitForVideo(args: {
  video_id: string;
  poll_interval_seconds?: number;
  timeout_seconds?: number;
}): Promise<string> {
  const pollInterval = (args.poll_interval_seconds || 10) * 1000;
  const timeout = (args.timeout_seconds || 600) * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await makeApiRequest(`/videos/${args.video_id}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get video status: ${response.status} - ${error}`);
    }

    const video: VideoJob = await response.json();

    if (video.status === "completed") {
      return JSON.stringify(
        {
          ...video,
          wait_time_seconds: Math.round((Date.now() - startTime) / 1000),
          message: "Video generation completed successfully!",
        },
        null,
        2
      );
    }

    if (video.status === "failed") {
      return JSON.stringify(
        {
          ...video,
          wait_time_seconds: Math.round((Date.now() - startTime) / 1000),
          message: `Video generation failed: ${video.error?.message || "Unknown error"}`,
        },
        null,
        2
      );
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timeout waiting for video ${args.video_id} after ${args.timeout_seconds} seconds`
  );
}

// Create and configure the server
const server = new Server(
  {
    name: "sora-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "create_video":
        result = await handleCreateVideo(args as Parameters<typeof handleCreateVideo>[0]);
        break;
      case "create_video_with_image":
        result = await handleCreateVideoWithImage(
          args as Parameters<typeof handleCreateVideoWithImage>[0]
        );
        break;
      case "get_video_status":
        result = await handleGetVideoStatus(
          args as Parameters<typeof handleGetVideoStatus>[0]
        );
        break;
      case "download_video":
        result = await handleDownloadVideo(
          args as Parameters<typeof handleDownloadVideo>[0]
        );
        break;
      case "list_videos":
        result = await handleListVideos(
          args as Parameters<typeof handleListVideos>[0]
        );
        break;
      case "delete_video":
        result = await handleDeleteVideo(
          args as Parameters<typeof handleDeleteVideo>[0]
        );
        break;
      case "remix_video":
        result = await handleRemixVideo(
          args as Parameters<typeof handleRemixVideo>[0]
        );
        break;
      case "wait_for_video":
        result = await handleWaitForVideo(
          args as Parameters<typeof handleWaitForVideo>[0]
        );
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sora MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
