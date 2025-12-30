# Vertex Image Generation 🎨

A SillyTavern extension for image generation using Google's Nano Banana Pro (Gemini 3 Pro Image) and Nano Banana (Gemini 2.5 Flash Image) models.

## Features

- **Message Generation Button** - Wand icon (✨) on each message to generate an image from that message's content
- **Character Context** - Optionally includes character and user descriptions in prompts
- **Multiple Aspect Ratios** - 1:1, 3:4, 4:3, 9:16, 16:9
- **Gallery** - View and manage generated images
- **Slash Commands** - `/vimg <prompt>` for quick generation

## Supported Models

| Model | Codename | Description | Best For |
|-------|----------|-------------|----------|
| **Nano Banana Pro** | `gemini-3-pro-image-preview` | Highest quality, advanced text rendering, up to 14 reference inputs | Complex compositions, text in images, professional work |
| **Nano Banana** | `gemini-2.5-flash-preview-image-generation` | Fast, good quality | Quick edits, casual creation |

## Pricing

### Nano Banana Pro (Gemini 3 Pro Image)
| Type | Price |
|------|-------|
| Input (text) | $1.25 / 1M tokens |
| Input (image) | $0.0032 / image |
| Output (text) | $10.00 / 1M tokens |
| Output (image) | **$0.04 / image** |

### Nano Banana (Gemini 2.5 Flash Image)
| Type | Price |
|------|-------|
| Input (text) | $0.15 / 1M tokens |
| Input (image) | $0.0004 / image |
| Output (text) | $0.60 / 1M tokens |
| Output (image) | **$0.02 / image** |

*Prices as of December 2025. Check [Google AI Pricing](https://ai.google.dev/pricing) for current rates.*

## Requirements

- SillyTavern (latest staging branch)
- Google AI Studio API key **OR** Vertex AI Express Mode configured
- Paid tier required for image generation

## Installation

1. Open SillyTavern Extensions panel
2. Click "Install Extension"
3. Paste: `https://github.com/delidgi/vertex`
4. Configure your Google AI / Vertex AI credentials in SillyTavern

## Usage

### Message Button
1. Open a chat with a character
2. Click "..." menu on any message
3. Click the wand icon (✨) to generate an image

### Generate Button
1. Open extension settings (Vertex Image Generation 🎨)
2. Click "Generate Image" to create from the last message

### Slash Commands
```
/vimg a beautiful sunset over mountains
/verteximagine portrait of a fantasy warrior
/verteximg scenic landscape with castle
```

## Configuration

| Setting | Description |
|---------|-------------|
| Model | Nano Banana Pro (best quality) or Nano Banana (faster) |
| Aspect Ratio | 1:1, 3:4, 4:3, 9:16, or 16:9 |
| Include Descriptions | Add character descriptions to the prompt |
| System Instruction | Custom instructions for image generation |

## Troubleshooting

### "Model not found" error
- Ensure you have a **paid** Google AI Studio or Vertex AI account
- Free tier does not support image generation

### "No image returned" error
- Try a different prompt
- Some content may be blocked by safety filters

### Images not generating
- Check browser console (F12) for detailed errors
- Verify your API key has image generation permissions

## What is Nano Banana?

**Nano Banana Pro** (Gemini 3 Pro Image) is Google DeepMind's state-of-the-art image generation model, announced November 2025. Key features:

- High-fidelity image generation with reasoning
- Accurate text rendering in multiple languages
- Character consistency with up to 14 reference inputs
- Complex multi-turn editing
- Search grounding for real-time information

**Nano Banana** (Gemini 2.5 Flash Image) is the faster, more affordable option for casual creation.

## Credits

- Based on [context-image-generation](https://github.com/elouann-h/context-image-generation) by Elouann
- Modified for Nano Banana Pro support
- Created for use with [SillyTavern](https://github.com/SillyTavern/SillyTavern)

## License

This project is released into the public domain under [The Unlicense](LICENSE).
