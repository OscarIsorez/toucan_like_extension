let DICTIONARY = {};
let replacementsDone = 0;
const MAX_REPLACEMENTS_PER_PAGE = 8;
const browserAPI = window.browser || window.chrome;

const BLOCKED_DOMAINS = [
    "google.",
    "bing.com",
    "duckduckgo.com",
    "yahoo.com"
];

// Helper for storage API compatibility
function getStorage(keys) {
    return new Promise(resolve => {
        if (window.browser && browser.storage) {
            browser.storage.local.get(keys).then(resolve);
        } else {
            chrome.storage.local.get(keys, resolve);
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
    const { selectedLists, savedPersonalWords } = await getStorage(['selectedLists', 'savedPersonalWords']);

    // Default to HSK1 if nothing configured
    const listsToLoad = selectedLists || ['hsk1'];
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
                }
            } catch (e) {
                console.error(`Failed to load ${filename}:`, e);
            }
        }
    }

    // Load Personal words (override HSK)
    if (listsToLoad.includes('personal') && savedPersonalWords && savedPersonalWords.length > 0) {
        processDictionaryData(savedPersonalWords);
    }

    startReplacement();
}

function processDictionaryData(data) {
    data.forEach(entry => {
        entry.translations.forEach(translation => {
            const key = translation.toLowerCase().trim();
            // New entries override old ones (Personal list loaded last takes precedence)
            DICTIONARY[key] = {
                chinese: entry.hanzi,
                pinyin: entry.pinyin,
                meaning: entry.translations[0]
            };
        });
    });
}

init();

function startReplacement() {
    const textNodes = getTextNodes(document.body);
    textNodes.forEach(replaceWordsInNode);
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
            Math.random() < 0.25
        ) {
            replacementsDone++;
            replaced = true;

            const entry = DICTIONARY[key];

            return `
        <span class="chinese-word"
              data-original="${part}"
              data-chinese="${entry.chinese}"
              data-pinyin="${entry.pinyin}"
              data-meaning="${entry.meaning}"
              data-state="chinese"
              title="${entry.meaning}">
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
