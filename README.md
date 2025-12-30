# Vertex Image Generation 🎨

A SillyTavern extension that adds Google Vertex AI Imagen-powered image generation with character context and avatar references.

## Features

- **Message Generation Button** - Wand icon in the dropdown menu on each message to generate an image from that message's content
- **Character Context** - Automatically includes character and user descriptions in prompts
- **Negative Prompts** - Specify what to avoid in generated images
- **Multiple Models** - Support for Imagen 3.0 Generate, Imagen 3.0 Fast, and Imagen 2.0
- **Slash Command** - `/verteximagine <prompt>` for quick generation

## Requirements

- SillyTavern (latest staging branch)
- Google Cloud Project with Vertex AI API enabled
- Proper authentication configured (Service Account or Application Default Credentials)

## Supported Models

| Model | Description | Speed | Quality |
|-------|-------------|-------|---------|
| `imagen-3.0-generate-002` | Latest Imagen model | Normal | Best |
| `imagen-3.0-fast-generate-001` | Optimized for speed | Fast | Good |
| `imagegeneration@006` | Imagen 2.0 (legacy) | Normal | Good |

## Installation

1. Navigate to your SillyTavern Extensions panel
2. Click "Install Extension" and paste this repo link
3. Configure your Google Cloud Project ID in the extension settings
4. Ensure Vertex AI API is enabled in your Google Cloud project

## Authentication Setup

### Option 1: Service Account (Recommended for servers)
1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of the key file

### Option 2: Application Default Credentials (For local development)
1. Install Google Cloud CLI
2. Run `gcloud auth application-default login`
3. The extension will use your logged-in credentials

## Usage

### Message Button
1. Open a chat with a character
2. Click the "..." menu on any message
3. Click the wand icon (✨) to generate an image from that message

### Settings Panel
- Configure model, aspect ratio, and number of images
- Add negative prompts to avoid unwanted elements
- Toggle character descriptions
- Customize the system instruction
- View and manage gallery

### Slash Commands
```
/verteximagine a beautiful sunset over mountains
/vimg portrait of a fantasy warrior
/verteximg scenic landscape with castle
/imagen cute anime character
```

## Configuration

| Setting | Description |
|---------|-------------|
| Model | Choose between Imagen 3.0 Generate, Fast, or 2.0 |
| Aspect Ratio | 1:1, 3:4, 4:3, 9:16, or 16:9 |
| Number of Images | Generate 1-4 images at once |
| Negative Prompt | Things to avoid in the generated image |
| Include Descriptions | Add character descriptions to the prompt |
| System Instruction | Customize instructions for the image model |
| Project ID | Your Google Cloud Project ID |
| Region | Vertex AI region (us-central1 recommended) |

## Pricing

Vertex AI Imagen pricing varies by model and region. Check [Google Cloud Pricing](https://cloud.google.com/vertex-ai/pricing) for current rates.

Approximate costs (as of 2024):
- Imagen 3.0: ~$0.02-0.04 per image
- Imagen 2.0: ~$0.01-0.02 per image

## Troubleshooting

### "Permission denied" error
- Ensure Vertex AI API is enabled in your project
- Verify your service account has the "Vertex AI User" role

### "Model not found" error
- Check that the selected model is available in your region
- Some models may require allowlisting

### Images not generating
- Check the browser console for detailed error messages
- Verify your authentication is properly configured

## Differences from Original Extension

This extension is based on [context-image-generation](https://github.com/elouann-h/context-image-generation) but uses:
- **Google Vertex AI** instead of AI Studio
- **Imagen models** instead of Gemini image generation
- **Direct API calls** with proper Vertex AI authentication
- **Negative prompts** support
- **Multiple image generation** support

## License

This project is released into the public domain under [The Unlicense](LICENSE). You are free to use, modify, and distribute this code for any purpose, with or without attribution.

## Credits

- Original concept: [Elouann](https://github.com/elouann-h/context-image-generation)
- Modified for Vertex AI compatibility
- Created for use with [SillyTavern](https://github.com/SillyTavern/SillyTavern)
