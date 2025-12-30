/**
 * Vertex Image Generation 🎨
 * Nano Banana Pro - Gemini-powered image generation with avatar references and character context
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

const extensionName = 'vertex';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    model: 'gemini-3-pro-image-preview',
    aspect_ratio: '1:1',
    use_avatars: true,
    include_descriptions: true,
    system_instruction: 'You are an image generation assistant. When reference images are provided, they represent the characters in the story. Generate an illustration that depicts the scene described in the prompt while maintaining the art style and appearance of the reference characters. You are not obligated to include both characters - if the scene depicts only one character alone, illustrate them alone.',
    gallery: [],
};

const MAX_GALLERY_SIZE = 50;

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }

    $('#vig_model').val(extension_settings[extensionName].model);
    $('#vig_aspect_ratio').val(extension_settings[extensionName].aspect_ratio);
    $('#vig_use_avatars').prop('checked', extension_settings[extensionName].use_avatars);
    $('#vig_include_descriptions').prop('checked', extension_settings[extensionName].include_descriptions);
    $('#vig_system_instruction').val(extension_settings[extensionName].system_instruction);

    renderGallery();
}

// Получение аватара пользователя
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

// Получение аватара персонажа
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

// Построение сообщений с аватарками
async function buildMessages(prompt, sender = null) {
    const settings = extension_settings[extensionName];
    const contentParts = [];

    // Системная инструкция
    if (settings.system_instruction) {
        contentParts.push({ type: 'text', text: settings.system_instruction });
    }

    // Описания персонажей
    if (settings.include_descriptions) {
        const descriptions = getCharacterDescriptions();
        let descText = '';
        if (descriptions.user_persona) {
            descText += `[${descriptions.user_name} (User) Description]: ${descriptions.user_persona}\n\n`;
        }
        if (descriptions.char_description) {
            descText += `[${descriptions.char_name} (Character) Description]: ${descriptions.char_description}\n\n`;
        }
        if (descriptions.char_scenario) {
            descText += `[Current Scenario]: ${descriptions.char_scenario}\n\n`;
        }
        if (descText) {
            contentParts.push({ type: 'text', text: descText.trim() });
        }
    }

    // Промпт с контекстом отправителя
    if (sender) {
        contentParts.push({ type: 'text', text: `[Message from ${sender}]: ${prompt}` });
    } else {
        contentParts.push({ type: 'text', text: prompt });
    }

    // Аватарки как референсы
    if (settings.use_avatars) {
        const charAvatarData = await getCharacterAvatar();
        const userAvatarData = await getUserAvatar();

        if (charAvatarData) {
            console.log(`[${extensionName}] Adding character avatar for: ${charAvatarData.name}`);
            contentParts.push({ type: 'text', text: `[Reference image for {{char}} - ${charAvatarData.name}]` });
            contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${charAvatarData.mimeType};base64,${charAvatarData.data}` },
            });
        }

        if (userAvatarData) {
            console.log(`[${extensionName}] Adding user avatar for: ${userAvatarData.name}`);
            contentParts.push({ type: 'text', text: `[Reference image for {{user}} - ${userAvatarData.name}]` });
            contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${userAvatarData.mimeType};base64,${userAvatarData.data}` },
            });
        }
    }

    return [{ role: 'user', content: contentParts }];
}

async function generateImageFromPrompt(prompt, sender = null) {
    const settings = extension_settings[extensionName];
    const messages = await buildMessages(prompt, sender);

    console.log(`[${extensionName}] Generating with model: ${settings.model}`);
    console.log(`[${extensionName}] Messages:`, JSON.stringify(messages, null, 2).substring(0, 500));

    const requestBody = {
        chat_completion_source: 'makersuite',
        model: settings.model,
        messages: messages,
        max_tokens: 8192,
        temperature: 1,
        request_images: true,
        request_image_aspect_ratio: settings.aspect_ratio || '1:1',
        stream: false,
    };

    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${extensionName}] API Error:`, errorText);
        let errorMessage = `API Error: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log(`[${extensionName}] Response received`);
    
    // Check for image in responseContent.parts (Gemini format)
    if (result.responseContent?.parts) {
        for (const part of result.responseContent.parts) {
            if (part.inlineData?.data) {
                console.log(`[${extensionName}] Found image in responseContent.parts`);
                return { 
                    imageData: part.inlineData.data, 
                    mimeType: part.inlineData.mimeType || 'image/png' 
                };
            }
        }
    }

    // Check choices format
    if (result.choices?.[0]?.message?.content) {
        const content = result.choices[0].message.content;
        if (Array.isArray(content)) {
            for (const part of content) {
                if (part.type === 'image_url' && part.image_url?.url) {
                    const url = part.image_url.url;
                    if (url.startsWith('data:')) {
                        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
                        if (matches) {
                            console.log(`[${extensionName}] Found image in choices`);
                            return { imageData: matches[2], mimeType: matches[1] };
                        }
                    }
                }
            }
        }
    }

    // Check if there's text response (model didn't generate image)
    const textContent = result.choices?.[0]?.message?.content;
    if (typeof textContent === 'string' && textContent.length > 0) {
        console.log(`[${extensionName}] Model returned text instead of image:`, textContent.substring(0, 200));
        throw new Error('Model returned text instead of image. Try a different prompt or model.');
    }

    throw new Error('No image was returned by the API');
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
            toastr.success('Image generated!', 'Vertex Image Generation');
        }

    } catch (error) {
        console.error(`[${extensionName}] Generation error:`, error);
        toastr.error(`Failed: ${error.message}`, 'Vertex Image Generation');
    } finally {
        generateBtn.removeClass('generating');
        generateBtn.find('i').removeClass('fa-spinner fa-spin').addClass('fa-image');
    }
}

async function vigMessageButton($icon) {
    const context = getContext();
    
    if ($icon.hasClass('vig_busy')) return;

    const messageElement = $icon.closest('.mes');
    const messageId = Number(messageElement.attr('mesid'));
    const message = context.chat[messageId];

    if (!message?.mes) {
        toastr.warning('No message content.', 'Vertex Image Generation');
        return;
    }

    const charName = getContext().name2 || 'Character';
    const userName = name1 || 'User';
    const sender = message.is_user ? `{{user}} (${userName})` : `{{char}} (${charName})`;

    $icon.addClass('vig_busy');
    $icon.removeClass('fa-wand-magic-sparkles').addClass('fa-spinner fa-spin');

    try {
        const result = await generateImageFromPrompt(message.mes, sender);

        if (result) {
            const imageDataUrl = `data:${result.mimeType};base64,${result.imageData}`;

            if (!message.extra) message.extra = {};
            if (!Array.isArray(message.extra.media)) message.extra.media = [];
            if (!message.extra.media_display) message.extra.media_display = MEDIA_DISPLAY.GALLERY;

            message.extra.media.push({
                url: imageDataUrl,
                type: MEDIA_TYPE.IMAGE,
                title: message.mes.substring(0, 100),
                source: MEDIA_SOURCE.GENERATED,
            });

            message.extra.media_index = message.extra.media.length - 1;
            message.extra.inline_image = true;

            appendMediaToMessage(message, messageElement, SCROLL_BEHAVIOR.KEEP);
            await saveChatConditional();
            addToGallery(result.imageData, message.mes, messageId);
            toastr.success('Image generated!', 'Vertex Image Generation');
        }

    } catch (error) {
        console.error(`[${extensionName}] Error:`, error);
        toastr.error(`Failed: ${error.message}`, 'Vertex Image Generation');
    } finally {
        $icon.removeClass('vig_busy fa-spinner fa-spin').addClass('fa-wand-magic-sparkles');
    }
}

async function slashCommandHandler(args, prompt) {
    const trimmedPrompt = String(prompt).trim();
    
    if (!trimmedPrompt) {
        toastr.warning('Please provide a prompt.', 'Vertex Image Generation');
        return '';
    }

    try {
        const result = await generateImageFromPrompt(trimmedPrompt, null);
        
        if (result) {
            const imageDataUrl = `data:${result.mimeType};base64,${result.imageData}`;
            $('#vig_preview_image').attr('src', imageDataUrl);
            $('#vig_preview_container').show();
            addToGallery(result.imageData, trimmedPrompt, null);
            return imageDataUrl;
        }
    } catch (error) {
        console.error(`[${extensionName}] Slash command error:`, error);
        toastr.error(`Failed: ${error.message}`, 'Vertex Image Generation');
    }
    
    return '';
}

function injectMessageButton(messageId) {
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    if (messageElement.length === 0) return;
    
    const extraButtons = messageElement.find('.extraMesButtons');
    if (extraButtons.length === 0 || extraButtons.find('.vig_message_gen').length > 0) return;

    const vigButton = $(`
        <div title="Generate with Nano Banana 🍌" 
             class="mes_button vig_message_gen fa-solid fa-wand-magic-sparkles">
        </div>
    `);

    const sdButton = extraButtons.find('.sd_message_gen');
    if (sdButton.length) {
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
    if (!confirm('Clear gallery?')) return;
    extension_settings[extensionName].gallery = [];
    saveSettingsDebounced();
    renderGallery();
    toastr.info('Gallery cleared.', 'Vertex Image Generation');
}

function viewGalleryImage(index) {
    const item = extension_settings[extensionName].gallery?.[index];
    if (!item) return;

    const popup = $(`
        <div class="vig_popup_overlay">
            <div class="vig_popup">
                <div class="vig_popup_header">
                    <span>${new Date(item.timestamp).toLocaleString()}</span>
                    <i class="fa-solid fa-xmark vig_popup_close"></i>
                </div>
                <img src="data:image/png;base64,${item.imageData}" />
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
    extension_settings[extensionName].gallery.splice(index, 1);
    saveSettingsDebounced();
    renderGallery();
}

jQuery(async () => {
    console.log(`[${extensionName}] Initializing Nano Banana Pro...`);
    
    try {
        const response = await fetch(`/scripts/extensions/third-party/${extensionName}/settings.html`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const settingsHtml = await response.text();
        $('#extensions_settings').append(settingsHtml);
    } catch (error) {
        console.error(`[${extensionName}] Error loading settings:`, error);
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

    $('#vig_use_avatars').on('change', function () {
        extension_settings[extensionName].use_avatars = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#vig_include_descriptions').on('change', function () {
        extension_settings[extensionName].include_descriptions = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#vig_system_instruction').on('input', function () {
        extension_settings[extensionName].system_instruction = $(this).val();
        saveSettingsDebounced();
    });

    $('#vig_generate_btn').on('click', generateImage);
    $('#vig_clear_gallery').on('click', clearGallery);

    $(document).on('click', '.vig_gallery_item img', function() {
        viewGalleryImage($(this).closest('.vig_gallery_item').data('index'));
    });

    $(document).on('click', '.vig_gallery_delete', function(e) {
        e.stopPropagation();
        deleteGalleryImage($(this).data('index'));
    });

    $(document).on('click', '.vig_message_gen', function(e) {
        vigMessageButton($(e.currentTarget));
    });

    eventSource.on(event_types.MESSAGE_RENDERED, injectMessageButton);
    eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(injectAllMessageButtons, 100));
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => setTimeout(injectAllMessageButtons, 100));
    eventSource.on(event_types.CHAT_CREATED, () => setTimeout(injectAllMessageButtons, 100));

    setTimeout(injectAllMessageButtons, 500);

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vimg',
        returns: 'URL of the generated image',
        callback: slashCommandHandler,
        aliases: ['verteximagine', 'verteximg', 'nanobanana'],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Prompt for image generation',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Generate an image with Nano Banana Pro. Example: /vimg sunset over mountains',
    }));

    console.log(`[${extensionName}] Nano Banana Pro loaded! 🍌`);
});
