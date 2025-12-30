/**
 * Vertex Image Generation 🎨
 * Google Vertex AI Imagen-powered image generation with avatar references and character context
 * Uses SillyTavern's backend to handle Google Vertex AI authentication
 */

import { 
    saveSettingsDebounced, 
    getRequestHeaders, 
    appendMediaToMessage, 
    eventSource, 
    event_types, 
    saveChatConditional,
    user_avatar,
    getUserAvatar as getAvatarPath,
    name1,
} from '../../../../script.js';

import { getContext, extension_settings } from '../../../extensions.js';
import { getBase64Async } from '../../../utils.js';
import { power_user } from '../../../power-user.js';
import { MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE, SCROLL_BEHAVIOR } from '../../../constants.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';

const extensionName = 'vertex-image-generation';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    model: 'imagen-3.0-generate-002',
    aspect_ratio: '1:1',
    number_of_images: 1,
    use_avatars: false,
    include_descriptions: false,
    negative_prompt: '',
    system_instruction: 'You are an image generation assistant. When reference images are provided, they represent the characters in the story. Generate an illustration that depicts the scene described in the prompt while maintaining the art style and appearance of the reference characters.',
    gallery: [],
    // Vertex AI specific settings
    project_id: '',
    location: 'us-central1',
    use_direct_api: true,  // true = direct Vertex API, false = through SillyTavern proxy
};

const MAX_GALLERY_SIZE = 50;

// Vertex AI Imagen models
const IMAGEN_MODELS = {
    'imagen-3.0-generate-002': {
        name: 'Imagen 3.0 Generate',
        description: 'Latest Imagen model for high-quality generation',
        maxImages: 4,
    },
    'imagen-3.0-fast-generate-001': {
        name: 'Imagen 3.0 Fast',
        description: 'Faster generation with slightly lower quality',
        maxImages: 4,
    },
    'imagegeneration@006': {
        name: 'Imagen 2.0',
        description: 'Previous generation model',
        maxImages: 4,
    },
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }

    $('#vig_model').val(extension_settings[extensionName].model);
    $('#vig_aspect_ratio').val(extension_settings[extensionName].aspect_ratio);
    $('#vig_number_of_images').val(extension_settings[extensionName].number_of_images);
    $('#vig_use_avatars').prop('checked', extension_settings[extensionName].use_avatars);
    $('#vig_include_descriptions').prop('checked', extension_settings[extensionName].include_descriptions);
    $('#vig_negative_prompt').val(extension_settings[extensionName].negative_prompt);
    $('#vig_system_instruction').val(extension_settings[extensionName].system_instruction);
    $('#vig_project_id').val(extension_settings[extensionName].project_id);
    $('#vig_location').val(extension_settings[extensionName].location);
    $('#vig_use_direct_api').prop('checked', extension_settings[extensionName].use_direct_api);

    toggleDirectApiSettings();
    renderGallery();
}

function toggleDirectApiSettings() {
    const useDirectApi = extension_settings[extensionName].use_direct_api;
    $('#vig_direct_api_settings').toggle(useDirectApi);
}

async function getUserAvatar() {
    try {
        let avatarUrl = getAvatarPath(user_avatar);
        if (!avatarUrl) return null;

        const response = await fetch(avatarUrl);
        if (!response.ok) return null;

        const blob = await response.blob();
        const base64 = await getBase64Async(blob);
        const parts = base64.split(',');
        const mimeType = parts[0]?.match(/data:([^;]+)/)?.[1] || 'image/png';
        const data = parts[1] || base64;
        const userName = name1 || 'User';

        return { mimeType, data, role: 'user', name: userName };
    } catch (error) {
        console.warn(`[${extensionName}] Error fetching user avatar:`, error);
        return null;
    }
}

async function getCharacterAvatar() {
    const context = getContext();
    const character = context.characters[context.characterId];
    if (!character?.avatar) return null;

    try {
        const avatarUrl = `/characters/${encodeURIComponent(character.avatar)}`;
        const response = await fetch(avatarUrl);
        if (!response.ok) return null;

        const blob = await response.blob();
        const base64 = await getBase64Async(blob);
        const parts = base64.split(',');
        const mimeType = parts[0]?.match(/data:([^;]+)/)?.[1] || 'image/png';

        return {
            mimeType,
            data: parts[1] || base64,
            role: 'character',
            name: context.name2 || 'Character',
        };
    } catch (error) {
        console.warn(`[${extensionName}] Error fetching character avatar:`, error);
        return null;
    }
}

function getLastMessage() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return { text: '', isUser: false };

    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (message.mes && !message.is_system) {
            return { text: message.mes, isUser: message.is_user };
        }
    }
    return { text: '', isUser: false };
}

function getCharacterDescriptions() {
    const context = getContext();
    const character = context.characters[context.characterId];
    const userName = name1 || context.name1 || 'User';

    return {
        user_name: userName,
        user_persona: power_user.persona_description || '',
        char_name: context.name2 || 'Character',
        char_description: character?.description || '',
        char_scenario: character?.scenario || '',
    };
}

/**
 * Build prompt for Vertex AI Imagen
 * @param {string} prompt - The prompt text
 * @param {string|null} sender - Optional sender: '{{user}}', '{{char}}', or null
 */
async function buildPrompt(prompt, sender = null) {
    const settings = extension_settings[extensionName];
    let fullPrompt = '';

    // Add system instruction
    if (settings.system_instruction) {
        fullPrompt += settings.system_instruction + '\n\n';
    }

    // Add character descriptions
    if (settings.include_descriptions) {
        const descriptions = getCharacterDescriptions();
        if (descriptions.user_persona) {
            fullPrompt += `[${descriptions.user_name} (User) Description]: ${descriptions.user_persona}\n\n`;
        }
        if (descriptions.char_description) {
            fullPrompt += `[${descriptions.char_name} (Character) Description]: ${descriptions.char_description}\n\n`;
        }
        if (descriptions.char_scenario) {
            fullPrompt += `[Current Scenario]: ${descriptions.char_scenario}\n\n`;
        }
    }

    // Add prompt with sender context
    if (sender) {
        fullPrompt += `[Message from ${sender}]: ${prompt}`;
    } else {
        fullPrompt += prompt;
    }

    return fullPrompt;
}

/**
 * Generate image using Vertex AI Imagen via SillyTavern proxy
 * This uses the existing Google AI integration in SillyTavern
 */
async function generateViaProxy(prompt, negativePrompt) {
    const settings = extension_settings[extensionName];
    
    // Build request for SillyTavern's backend
    const requestBody = {
        // Use vertex as the source
        chat_completion_source: 'makersuite',
        model: settings.model,
        prompt: prompt,
        negative_prompt: negativePrompt || undefined,
        aspect_ratio: settings.aspect_ratio,
        number_of_images: settings.number_of_images,
        // Signal this is an image generation request
        request_images: true,
        request_image_aspect_ratio: settings.aspect_ratio,
    };

    console.log(`[${extensionName}] Generating via proxy with model:`, settings.model);

    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${extensionName}] API Error Response:`, errorText);
        let errorMessage = `API Error: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Handle Vertex AI response format
    if (result.predictions) {
        const images = [];
        for (const prediction of result.predictions) {
            if (prediction.bytesBase64Encoded) {
                images.push({
                    imageData: prediction.bytesBase64Encoded,
                    mimeType: prediction.mimeType || 'image/png',
                });
            }
        }
        if (images.length > 0) {
            return images[0]; // Return first image
        }
    }
    
    // Handle standard response format
    const responseContent = result.responseContent;
    if (responseContent?.parts) {
        for (const part of responseContent.parts) {
            if (part.inlineData?.data) {
                return { 
                    imageData: part.inlineData.data, 
                    mimeType: part.inlineData.mimeType || 'image/png' 
                };
            }
        }
    }

    throw new Error('No image was returned by the API');
}

/**
 * Generate image using direct Vertex AI API call
 * Requires project_id and proper authentication
 */
async function generateDirectApi(prompt, negativePrompt) {
    const settings = extension_settings[extensionName];
    
    if (!settings.project_id) {
        throw new Error('Project ID is required for direct Vertex AI API calls. Please configure it in settings.');
    }

    const endpoint = `https://${settings.location}-aiplatform.googleapis.com/v1/projects/${settings.project_id}/locations/${settings.location}/publishers/google/models/${settings.model}:predict`;

    // Vertex AI Imagen request format
    const requestBody = {
        instances: [
            {
                prompt: prompt,
            }
        ],
        parameters: {
            sampleCount: settings.number_of_images,
            aspectRatio: settings.aspect_ratio,
        }
    };

    // Add negative prompt if provided
    if (negativePrompt) {
        requestBody.instances[0].negativePrompt = negativePrompt;
    }

    console.log(`[${extensionName}] Generating via direct API:`, endpoint);

    // Use SillyTavern's proxy to handle authentication
    const response = await fetch('/api/vertex/generate-image', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            endpoint: endpoint,
            body: requestBody,
            project_id: settings.project_id,
            location: settings.location,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${extensionName}] Direct API Error:`, errorText);
        let errorMessage = `Vertex API Error: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Parse Vertex AI Imagen response
    if (result.predictions && result.predictions.length > 0) {
        const prediction = result.predictions[0];
        if (prediction.bytesBase64Encoded) {
            return {
                imageData: prediction.bytesBase64Encoded,
                mimeType: prediction.mimeType || 'image/png',
            };
        }
    }

    throw new Error('No image was returned by Vertex AI');
}

/**
 * Core generation function
 * @param {string} prompt - The prompt
 * @param {string|null} sender - Optional sender context
 */
async function generateImageFromPrompt(prompt, sender = null) {
    const settings = extension_settings[extensionName];
    const fullPrompt = await buildPrompt(prompt, sender);
    const negativePrompt = settings.negative_prompt || '';

    console.log(`[${extensionName}] Full prompt:`, fullPrompt.substring(0, 200) + '...');

    // Choose generation method
    if (settings.use_direct_api) {
        return await generateDirectApi(fullPrompt, negativePrompt);
    } else {
        return await generateViaProxy(fullPrompt, negativePrompt);
    }
}

function addToGallery(imageData, prompt, messageId = null) {
    const settings = extension_settings[extensionName];
    
    if (!settings.gallery) {
        settings.gallery = [];
    }

    settings.gallery.unshift({
        imageData: imageData,
        prompt: prompt.substring(0, 200),
        timestamp: Date.now(),
        messageId: messageId,
    });

    if (settings.gallery.length > MAX_GALLERY_SIZE) {
        settings.gallery = settings.gallery.slice(0, MAX_GALLERY_SIZE);
    }

    saveSettingsDebounced();
    renderGallery();
}

function renderGallery() {
    const settings = extension_settings[extensionName];
    const gallery = settings.gallery || [];
    const container = $('#vig_gallery_container');
    const emptyMsg = $('#vig_gallery_empty');

    container.empty();

    if (gallery.length === 0) {
        emptyMsg.show();
        return;
    }

    emptyMsg.hide();

    for (let i = 0; i < gallery.length; i++) {
        const item = gallery[i];
        const thumb = $(`
            <div class="vig_gallery_item" data-index="${i}" title="${item.prompt}">
                <img src="data:image/png;base64,${item.imageData}" />
                <div class="vig_gallery_item_overlay">
                    <i class="fa-solid fa-trash vig_gallery_delete" data-index="${i}"></i>
                </div>
            </div>
        `);
        container.append(thumb);
    }
}

async function generateImage() {
    const lastMsg = getLastMessage();
    if (!lastMsg.text) {
        toastr.warning('No message found to generate image from.', 'Vertex Image Generation');
        return;
    }

    const generateBtn = $('#vig_generate_btn');
    generateBtn.addClass('generating');
    generateBtn.find('i').removeClass('fa-image').addClass('fa-spinner fa-spin');

    // Determine sender
    const charName = getContext().name2 || 'Character';
    const userName = name1 || 'User';
    const sender = lastMsg.isUser ? `{{user}} (${userName})` : `{{char}} (${charName})`;

    try {
        const result = await generateImageFromPrompt(lastMsg.text, sender);
        
        if (result) {
            const imageDataUrl = `data:${result.mimeType};base64,${result.imageData}`;
            $('#vig_preview_image').attr('src', imageDataUrl);
            $('#vig_preview_container').show();
            addToGallery(result.imageData, lastMsg.text, null);
        }

    } catch (error) {
        console.error(`[${extensionName}] Generation error:`, error);
        toastr.error(`Failed to generate image: ${error.message}`, 'Vertex Image Generation');
    } finally {
        generateBtn.removeClass('generating');
        generateBtn.find('i').removeClass('fa-spinner fa-spin').addClass('fa-image');
    }
}

async function vigMessageButton($icon) {
    const context = getContext();
    
    if ($icon.hasClass('vig_busy')) {
        console.log('[VIG] Already generating...');
        return;
    }

    const messageElement = $icon.closest('.mes');
    const messageId = Number(messageElement.attr('mesid'));
    const message = context.chat[messageId];

    if (!message) {
        console.error('[VIG] Could not find message for generation button');
        return;
    }

    const prompt = message.mes;
    if (!prompt) {
        toastr.warning('No message content to generate from.', 'Vertex Image Generation');
        return;
    }

    // Determine sender from message
    const charName = getContext().name2 || 'Character';
    const userName = name1 || 'User';
    const sender = message.is_user ? `{{user}} (${userName})` : `{{char}} (${charName})`;

    $icon.addClass('vig_busy');
    $icon.removeClass('fa-wand-magic-sparkles').addClass('fa-spinner fa-spin');

    try {
        const result = await generateImageFromPrompt(prompt, sender);

        if (result) {
            const imageDataUrl = `data:${result.mimeType};base64,${result.imageData}`;

            if (!message.extra || typeof message.extra !== 'object') {
                message.extra = {};
            }

            if (!Array.isArray(message.extra.media)) {
                message.extra.media = [];
            }

            if (!message.extra.media_display) {
                message.extra.media_display = MEDIA_DISPLAY.GALLERY;
            }

            const mediaAttachment = {
                url: imageDataUrl,
                type: MEDIA_TYPE.IMAGE,
                title: prompt.substring(0, 100),
                source: MEDIA_SOURCE.GENERATED,
            };

            message.extra.media.push(mediaAttachment);
            message.extra.media_index = message.extra.media.length - 1;
            message.extra.inline_image = true;

            appendMediaToMessage(message, messageElement, SCROLL_BEHAVIOR.KEEP);
            await saveChatConditional();
            addToGallery(result.imageData, prompt, messageId);
        }

    } catch (error) {
        console.error(`[${extensionName}] Message generation error:`, error);
        toastr.error(`Failed to generate: ${error.message}`, 'Vertex Image Generation');
    } finally {
        $icon.removeClass('vig_busy fa-spinner fa-spin').addClass('fa-wand-magic-sparkles');
    }
}

async function slashCommandHandler(args, prompt) {
    const trimmedPrompt = String(prompt).trim();
    
    if (!trimmedPrompt) {
        toastr.warning('Please provide a prompt for image generation.', 'Vertex Image Generation');
        return '';
    }

    try {
        // No sender for slash commands - it's a direct prompt
        const result = await generateImageFromPrompt(trimmedPrompt, null);
        
        if (result) {
            const imageDataUrl = `data:${result.mimeType};base64,${result.imageData}`;
            $('#vig_preview_image').attr('src', imageDataUrl);
            $('#vig_preview_container').show();
            addToGallery(result.imageData, trimmedPrompt, null);
            return imageDataUrl;
        }
    } catch (error) {
        console.error(`[${extensionName}] Slash command generation error:`, error);
        toastr.error(`Failed to generate: ${error.message}`, 'Vertex Image Generation');
    }
    
    return '';
}

function injectMessageButton(messageId) {
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    if (messageElement.length === 0) return;
    
    const extraButtons = messageElement.find('.extraMesButtons');
    if (extraButtons.length === 0) return;

    if (extraButtons.find('.vig_message_gen').length > 0) return;

    const vigButton = $(`
        <div title="Generate with Vertex AI 🎨" 
             class="mes_button vig_message_gen fa-solid fa-wand-magic-sparkles" 
             data-i18n="[title]Generate with Vertex AI 🎨">
        </div>
    `);

    const sdButton = extraButtons.find('.sd_message_gen');
    const cigButton = extraButtons.find('.cig_message_gen');
    
    if (cigButton.length) {
        cigButton.after(vigButton);
    } else if (sdButton.length) {
        sdButton.after(vigButton);
    } else {
        extraButtons.prepend(vigButton);
    }
}

function injectAllMessageButtons() {
    $('.mes').each(function() {
        const messageId = $(this).attr('mesid');
        if (messageId !== undefined) {
            injectMessageButton(Number(messageId));
        }
    });
}

async function clearGallery() {
    if (!confirm('Are you sure you want to clear the gallery? This cannot be undone.')) {
        return;
    }

    extension_settings[extensionName].gallery = [];
    saveSettingsDebounced();
    renderGallery();
    toastr.info('Gallery cleared.', 'Vertex Image Generation');
}

function viewGalleryImage(index) {
    const settings = extension_settings[extensionName];
    const item = settings.gallery[index];
    if (!item) return;

    const imageUrl = `data:image/png;base64,${item.imageData}`;
    
    const popup = $(`
        <div class="vig_popup_overlay">
            <div class="vig_popup">
                <div class="vig_popup_header">
                    <span>${new Date(item.timestamp).toLocaleString()}</span>
                    <i class="fa-solid fa-xmark vig_popup_close"></i>
                </div>
                <img src="${imageUrl}" />
                <div class="vig_popup_prompt">${item.prompt}</div>
            </div>
        </div>
    `);

    popup.on('click', '.vig_popup_close, .vig_popup_overlay', function(e) {
        if (e.target === this || $(e.target).hasClass('vig_popup_close')) {
            popup.remove();
        }
    });

    $('body').append(popup);
}

function deleteGalleryImage(index) {
    const settings = extension_settings[extensionName];
    settings.gallery.splice(index, 1);
    saveSettingsDebounced();
    renderGallery();
}

jQuery(async () => {
    console.log(`[${extensionName}] Initializing extension...`);
    
    try {
        const response = await fetch(`/scripts/extensions/third-party/${extensionName}/settings.html`);
        if (!response.ok) throw new Error(`Failed to load template: ${response.status}`);
        const settingsHtml = await response.text();
        $('#extensions_settings').append(settingsHtml);
    } catch (error) {
        console.error(`[${extensionName}] Error loading settings template:`, error);
        toastr.error('Failed to load extension settings.', 'Vertex Image Generation');
        return;
    }

    await loadSettings();

    // Event handlers
    $('#vig_model').on('change', function () {
        extension_settings[extensionName].model = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_aspect_ratio').on('change', function () {
        extension_settings[extensionName].aspect_ratio = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_number_of_images').on('change', function () {
        extension_settings[extensionName].number_of_images = parseInt($(this).val()) || 1;
        saveSettingsDebounced();
    });

    $('#vig_use_avatars').on('change', function () {
        extension_settings[extensionName].use_avatars = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#vig_include_descriptions').on('change', function () {
        extension_settings[extensionName].include_descriptions = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#vig_negative_prompt').on('input', function () {
        extension_settings[extensionName].negative_prompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_system_instruction').on('input', function () {
        extension_settings[extensionName].system_instruction = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_project_id').on('input', function () {
        extension_settings[extensionName].project_id = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_location').on('change', function () {
        extension_settings[extensionName].location = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_use_direct_api').on('change', function () {
        extension_settings[extensionName].use_direct_api = $(this).prop('checked');
        toggleDirectApiSettings();
        saveSettingsDebounced();
    });

    $('#vig_generate_btn').on('click', generateImage);
    $('#vig_clear_gallery').on('click', clearGallery);

    $(document).on('click', '.vig_gallery_item img', function() {
        const index = $(this).closest('.vig_gallery_item').data('index');
        viewGalleryImage(index);
    });

    $(document).on('click', '.vig_gallery_delete', function(e) {
        e.stopPropagation();
        const index = $(this).data('index');
        deleteGalleryImage(index);
    });

    $(document).on('click', '.vig_message_gen', function(e) {
        vigMessageButton($(e.currentTarget));
    });

    eventSource.on(event_types.MESSAGE_RENDERED, (messageId) => {
        injectMessageButton(messageId);
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(injectAllMessageButtons, 100);
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        setTimeout(injectAllMessageButtons, 100);
    });

    eventSource.on(event_types.CHAT_CREATED, () => {
        setTimeout(injectAllMessageButtons, 100);
    });

    setTimeout(injectAllMessageButtons, 500);

    // Register slash commands
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'verteximagine',
        returns: 'URL of the generated image, or an empty string if generation failed',
        callback: slashCommandHandler,
        aliases: ['vimg', 'verteximg', 'imagen'],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Prompt for image generation',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Generate an image using Google Vertex AI Imagen. Example: /verteximagine a beautiful sunset over mountains',
    }));

    console.log(`[${extensionName}] Extension loaded successfully!`);
});
