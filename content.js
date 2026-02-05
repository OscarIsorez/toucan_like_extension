let DICTIONARY = {};
let replacementsDone = 0;
const MAX_REPLACEMENTS_PER_PAGE = 50; // Increased to allow more translations

// Browser API compatibility
const browserAPI = (() => {
    if (typeof browser !== 'undefined' && browser.runtime) {
        return browser;
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        return chrome;
    } else {
        console.error('No compatible browser API found');
        return null;
    }
})();

const BLOCKED_DOMAINS = [
    "google.",
    "bing.com",
    "duckduckgo.com",
    "yahoo.com"
];

// Helper for storage API compatibility
function getStorage(keys) {
    return new Promise(resolve => {
        if (browserAPI && browserAPI.storage && browserAPI.storage.local) {
            browserAPI.storage.local.get(keys, resolve);
        } else {
            resolve({});
        }
    });
}

function init() {
    if (BLOCKED_DOMAINS.some(d => location.hostname.includes(d))) {
        return;
    }

    loadDictionaries();
}

async function loadDictionaries() {
    if (!browserAPI) {
        console.error('Browser API not available');
        return;
    }

    const { selectedLists, savedPersonalWords } = await getStorage(['selectedLists', 'savedPersonalWords']);

    // Default to HSK1 if nothing configured
    const listsToLoad = selectedLists || ['hsk1'];
    console.log('Loading dictionary lists:', listsToLoad);
    DICTIONARY = {};

    // Map of list IDs to filenames
    const hskFiles = {
        'hsk1': 'hsk/hsk-level-1.json',
        'hsk2': 'hsk/hsk-level-2.json',
        'hsk3': 'hsk/hsk-level-3.json',
        'hsk4': 'hsk/hsk-level-4.json',
        'hsk5': 'hsk/hsk-level-5.json',
        'hsk6': 'hsk/hsk-level-6.json'
    };

    // Load HSK lists
    for (const [listId, filename] of Object.entries(hskFiles)) {
        if (listsToLoad.includes(listId)) {
            try {
                const url = browserAPI.runtime.getURL(filename);
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    processDictionaryData(data);
                    console.log(`Loaded ${data.length} words from ${filename}`);
                } else {
                    console.error(`Failed to fetch ${filename}: ${res.status}`);
                }
            } catch (e) {
                console.error(`Failed to load ${filename}:`, e);
            }
        }
    }

    // Load Personal words (override HSK)
    if (listsToLoad.includes('personal') && savedPersonalWords && savedPersonalWords.length > 0) {
        processDictionaryData(savedPersonalWords);
        console.log(`Loaded ${savedPersonalWords.length} personal words`);
    }

    console.log(`Total dictionary size: ${Object.keys(DICTIONARY).length} entries`);
    startReplacement();
}

function processDictionaryData(data) {
    data.forEach(entry => {
        entry.translations.forEach(translation => {
            const key = translation.toLowerCase().trim();
            // Store all available translations for contextual selection
            DICTIONARY[key] = {
                chinese: entry.hanzi,
                pinyin: entry.pinyin,
                allTranslations: entry.translations,
                primaryMeaning: entry.translations[0] // Keep primary as fallback
            };
        });
    });
}

init();

// Listen for storage changes to reload dictionary when settings change
if (browserAPI && browserAPI.storage && browserAPI.storage.onChanged) {
    browserAPI.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes.selectedLists || changes.savedPersonalWords)) {
            console.log('Settings changed, reloading dictionary...');
            replacementsDone = 0; // Reset replacement counter
            loadDictionaries();
        }
    });
}

function startReplacement() {
    const textNodes = getTextNodes(document.body);
    textNodes.forEach(replaceWordsInNode);
}

// Extract surrounding sentences for context analysis
function extractContext(textNode, targetWord) {
    // Get the full text content from parent elements for better context
    let contextElement = textNode.parentElement;

    // Try to get a larger context (paragraph or container)
    for (let i = 0; i < 3; i++) {
        if (contextElement.parentElement &&
            contextElement.parentElement.textContent.length > contextElement.textContent.length) {
            contextElement = contextElement.parentElement;
        } else {
            break;
        }
    }

    const fullText = contextElement.textContent;
    const sentences = fullText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);

    // Find sentences containing the target word
    const wordRegex = new RegExp(`\\b${targetWord}\\b`, 'i');
    const relevantSentences = [];

    for (let i = 0; i < sentences.length; i++) {
        if (wordRegex.test(sentences[i])) {
            // Get current sentence and up to 1 sentence before and after
            const contextSentences = [];
            if (i > 0) contextSentences.push(sentences[i - 1]);
            contextSentences.push(sentences[i]);
            if (i < sentences.length - 1) contextSentences.push(sentences[i + 1]);

            relevantSentences.push(...contextSentences);
        }
    }

    return relevantSentences.slice(0, 3).join(' ').toLowerCase();
}

// Select best translation based on context
function selectBestTranslation(entry, context, originalWord) {
    if (!entry.allTranslations || entry.allTranslations.length <= 1) {
        return entry.primaryMeaning;
    }

    const contextWords = context.split(/\s+/);
    const translations = entry.allTranslations;

    // Context-based scoring system
    const scores = translations.map(translation => {
        let score = 0;
        const translationWords = translation.toLowerCase().split(/\s+/);

        // Check for contextual word matches
        translationWords.forEach(tWord => {
            // Direct word matches in context
            if (contextWords.includes(tWord)) {
                score += 3;
            }

            // Semantic context patterns
            if (context.includes('time') && ['time', 'hour', 'moment', 'period'].includes(tWord)) {
                score += 2;
            }
            if (context.includes('money') && ['money', 'cost', 'price', 'pay'].includes(tWord)) {
                score += 2;
            }
            if (context.includes('person') && ['person', 'people', 'man', 'woman'].includes(tWord)) {
                score += 2;
            }
            if (/\\b(eat|food|cook|meal|restaurant)\\b/.test(context) &&
                ['eat', 'food', 'dish', 'meal', 'cook'].includes(tWord)) {
                score += 2;
            }
            if (/\\b(work|job|office|business)\\b/.test(context) &&
                ['work', 'job', 'business', 'office'].includes(tWord)) {
                score += 2;
            }
            if (/\\b(go|come|travel|move)\\b/.test(context) &&
                ['go', 'come', 'travel', 'move', 'arrive'].includes(tWord)) {
                score += 2;
            }
        });

        // Prefer shorter, more common translations
        if (translation.length < 10) score += 1;
        if (translation.split(' ').length === 1) score += 0.5;

        return { translation, score };
    });

    // Sort by score and return best match
    scores.sort((a, b) => b.score - a.score);

    // If no significant score difference, prefer primary meaning
    if (scores[0].score === 0 || (scores[0].score - scores[1]?.score || 0) < 1) {
        return entry.primaryMeaning;
    }

    console.log(`Context-selected "${scores[0].translation}" for "${originalWord}" (score: ${scores[0].score})`);
    return scores[0].translation;
}

function getTextNodes(root) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.parentElement) return NodeFilter.FILTER_REJECT;

                const tag = node.parentElement.tagName;
                if (
                    ["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "CODE", "PRE"].includes(tag)
                ) {
                    return NodeFilter.FILTER_REJECT;
                }

                if (!node.textContent.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    return nodes;
}

function replaceWordsInNode(textNode) {
    if (replacementsDone >= MAX_REPLACEMENTS_PER_PAGE) return;

    const parts = textNode.textContent.split(/\b/);
    let replaced = false;

    const newHTML = parts.map(part => {
        const key = part.toLowerCase();

        if (
            DICTIONARY[key] &&
            replacementsDone < MAX_REPLACEMENTS_PER_PAGE &&
            Math.random() < 0.25 // 25% chance to replace each occurrence to avoid overwhelming the page
        ) {
            replacementsDone++;
            replaced = true;

            const entry = DICTIONARY[key];

            // Extract context and select best translation
            const context = extractContext(textNode, part);
            const bestTranslation = selectBestTranslation(entry, context, part);

            return `
        <span class="chinese-word"
              data-original="${part}"
              data-chinese="${entry.chinese}"
              data-pinyin="${entry.pinyin}"
              data-meaning="${bestTranslation}"
              data-state="chinese"
              title="${bestTranslation}">
          <span class="chinese-character">${entry.chinese}</span>
          <span class="pinyin">${entry.pinyin}</span>
        </span>
      `;
        }

        return part;
    }).join("");

    if (replaced) {
        const span = document.createElement("span");
        span.innerHTML = newHTML;
        textNode.replaceWith(span);
    }
}

document.addEventListener("click", e => {
    const el = e.target.closest('.chinese-word');
    if (!el) return;

    if (el.dataset.state === "chinese") {
        console.log(e.target);
        el.innerHTML = el.dataset.original;
        el.dataset.state = "original";
        el.title = el.dataset.meaning;
    } else {
        el.innerHTML = `
      <span class="chinese-character">${el.dataset.chinese}</span>
      <span class="pinyin">${el.dataset.pinyin}</span>
    `;
        el.dataset.state = "chinese";
        el.title = el.dataset.meaning;
    }
});
